# Harness Model

See [Glossary](glossary.md) for shared terminology.

## Core Idea

Architect Companion should be agent-neutral at its core.

The repository-specific harness instance lives in `.architect-companion/`. Reusable architectural knowledge lives in `profiles/`. Together, those inputs produce the effective harness model that renderers and checks consume.

Architect Companion then renders the effective harness model into target-specific integrations such as `AGENTS.md`, `CLAUDE.md`, Cursor rules, Copilot instructions, Codex hooks, Claude Code commands, MCP prompts, and CI workflows.

In short:

```text
profiles/ + .architect-companion/   harness inputs
              |
              v
effective harness model             resolved source model
              |
              v
architect-companion render          compiler / renderer
              |
              v
agent and platform targets          generated adapters
```

The harness owns the architecture model. Individual agents are execution surfaces.

## Why This Matters

Teams may use different coding agents across projects. Some may use Codex, some Cursor, some Claude Code, and some GitHub Copilot. The harness should not require a team to standardize on a single agent.

The stable product concept is therefore:

- one tool-independent architecture harness
- many generated adapters
- deterministic checks that work even when no agent is involved

This keeps the project useful across agent ecosystems and protects the core model from vendor-specific churn.

## Canonical Source Layout

A future repository using the harness could contain:

```text
.architect-companion/
  harness.yml
  architecture/
    boundaries.yml
    components.yml
    ownership.yml
    risks.yml
    exceptions.yml
  workflows/
    plan-change.md
    implement-change.md
    review-change.md
    propose-adr.md
    dependency-change.md
  policies/
    dependency-boundaries.yml
    adr-triggers.yml
    test-expectations.yml
  targets/
    agents-md.yml
    claude-code.yml
    cursor.yml
    copilot.yml
    codex.yml
    github-actions.yml
```

The exact schema is still open, but the responsibility split should stay stable:

- `architecture/` describes the intended system structure.
- `workflows/` describes how agents and developers should approach common tasks.
- `policies/` describes checks and enforcement rules.
- `targets/` configures how the canonical model is rendered for specific tools.
- `harness.yml` selects the project profiles, active languages, boundary
  metadata, and render targets.

Reusable architectural knowledge, such as the defaults for a good modular monolith, should be packaged as profiles. See [Profile Model](profile-model.md).

## Generated Targets

The renderer can generate or update files such as:

```text
AGENTS.md
CLAUDE.md
.cursor/rules/*.mdc
.github/copilot-instructions.md
.codex/config.toml
.codex/hooks.json
.claude/settings.json
.claude/commands/*.md
.github/workflows/architect-companion.yml
```

Generated files should be treated as adapters. They should contain only what the target tool needs in the shape that tool understands.

The source model remains the effective harness model produced from `profiles/` and `.architect-companion/`.

Rendering should be deterministic and should not use AI. See [Rendering And Checks](rendering-and-checks.md) for the compiler, renderer, CI, and check model.

## CLI Shape

The first CLI should make the source/target split obvious:

```bash
architect-companion init
architect-companion render
architect-companion render --check
architect-companion review
architect-companion doctor
architect-companion explain
```

Possible meanings:

- `init`: scaffold `.architect-companion/` from selected profiles and render the enabled targets in a single atomic transaction. See [Init Command](init.md).
- `render`: generate target-specific files from the effective harness model.
- `render --check`: fail when generated targets would change, without writing anything.
- `review`: review a diff against the harness model.
- `doctor`: show active targets, missing files, stale generated outputs, and unsupported integrations.
- `explain`: print relevant harness context for manual use in any agent.

External analysis tools (dependency-cruiser, Semgrep, ArchUnit, etc.) are not invoked through a dedicated Architect Companion command. `render` writes their configuration and the matching CI step; the CI runner executes them.

Later, the same model can be exposed through:

```bash
architect-companion mcp serve
```

That would let agents access architecture resources, workflows, and checks through MCP when supported.

## User Flow

A typical setup flow is:

```bash
architect-companion init
```

`init` resolves the profiles, project languages, project name, and target
selections — either from flags, from an interactive wizard when stdin is a TTY,
or from sensible defaults — pre-flights the working tree for conflicts, then
scaffolds `.architect-companion/` and renders the enabled targets in one atomic
step. See [Init Command](init.md) for the full contract, flag surface, and
failure modes.

After init, the user keeps working with their preferred tools:

- Cursor reads Cursor rules or `AGENTS.md`.
- Claude Code reads Claude-specific commands, settings, or instructions.
- Codex reads `AGENTS.md`, Codex config, hooks, or MCP.
- Copilot reads custom instructions.
- CI runs `architect-companion render --check` and any selected analysis engines as separate steps.

Developers do not have to change their preferred agent for the harness to be useful.

## Rendered File Ownership

Generated target files should be clearly marked, for example:

```text
<!-- Generated by Architect Companion. Edit .architect-companion/ instead. -->
```

The project should decide later whether generated files are fully owned by the renderer or whether they support managed sections inside otherwise hand-written files.

Today the renderer uses full-file generation for files that the harness owns.

## Design Preference

Prefer this order:

1. Define a small canonical harness model.
2. Build a CLI that can initialize, render, and check that model.
3. Add render targets for the most common agent instruction formats.
4. Add CI integration.
5. Add MCP support.
6. Add richer agent-specific plugins only where they provide clear extra value.

This avoids building the product around any single coding agent while still integrating deeply where useful.
