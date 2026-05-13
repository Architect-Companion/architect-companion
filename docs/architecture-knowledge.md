# Architecture Knowledge

## Core Question

Where does architectural knowledge live in Architect Companion?

It should not live primarily in generated files such as `AGENTS.md`, `CLAUDE.md`, Cursor rules, or Copilot instructions. Those files are target-specific render outputs.

Architectural knowledge lives in reusable profiles and in the project-specific harness configuration that applies those profiles to a real repository.

## Knowledge Layers

## 1. Architecture Profiles

Profiles encode opinionated defaults for common architectural contexts.

Examples:

```text
profiles/
  modular-monolith/
  service-oriented-system/
  frontend-application/
  data-product/
  legacy-modernization/
```

A profile answers:

- What architectural style is this?
- What boundaries matter?
- Which dependencies are acceptable?
- Which changes require extra care?
- What does a well-structured implementation look like in this context?

## 2. Policies

Policies turn architectural expectations into executable or reviewable rules.

Examples:

- UI code must not call persistence directly.
- Domain modules must not depend on adapter modules.
- New external dependencies require an explicit justification.
- Public API changes require contract tests.
- Cross-service data coupling requires an architecture decision record.
- Generated code must stay behind a defined boundary.

Policies can be advisory, warning-only, or enforcing.

## 3. Workflows

Workflows describe how developers and agents should approach recurring tasks.

Examples:

- plan before editing
- map architectural impact before changing shared code
- identify affected boundaries before refactoring
- propose an ADR before changing integration style
- run narrow checks first, then broader checks before review
- ask for explicit confirmation before introducing irreversible decisions

## 4. Review Heuristics

Review heuristics capture architectural judgment that is difficult to express as a deterministic rule.

Examples:

- Does this change increase coupling?
- Is this abstraction justified by current complexity?
- Is the proposed boundary stable enough?
- Does the implementation hide a product decision inside technical code?
- Is this migration reversible?
- Is the change solving the symptom instead of the design issue?

These heuristics can be rendered into review prompts, MCP prompts, checklist sections, or pull request guidance.

## 5. Examples And Reference Implementations

Examples show the architectural knowledge in concrete form.

Examples:

- a small modular monolith with clear boundaries
- a service integration example with an ADR
- a frontend feature organized according to the profile
- a bad-to-good refactoring example
- a dependency exception example

## 6. Exception Model

Architecture work needs a disciplined way to handle justified deviations.

The harness should encode:

- how to request an exception
- when an exception expires
- who owns it
- what risk it introduces
- what follow-up is expected

## 7. Target Rendering

Different tools need different expressions of the same architectural intent.

For example:

- `AGENTS.md` may need concise global guidance.
- Cursor rules may need scoped file patterns.
- Claude Code may benefit from slash commands and hooks.
- Codex may benefit from `AGENTS.md`, hooks, MCP, and CI integration.
- GitHub Actions needs deterministic checks and machine-readable output.

The renderer should preserve the same intent across targets without making the generated target files the source of truth.

## Where This Lives In The Repository

A project using Architect Companion might contain:

```text
.architect-companion/
  harness.yml
  profile.yml
  architecture/
    boundaries.yml
    components.yml
    ownership.yml
    exceptions.yml
  policies/
    dependency-boundaries.yml
    external-dependencies.yml
    adr-triggers.yml
    test-expectations.yml
  workflows/
    plan-change.md
    review-change.md
    propose-adr.md
    dependency-change.md
  heuristics/
    architecture-review.md
    refactoring-review.md
  examples/
    module-boundary-good.md
    module-boundary-bad.md
```

The Architect Companion repository can also contain reusable default profiles:

```text
profiles/
  modular-monolith/
  service-oriented-system/
  frontend-application/
```

See [Profile Model](profile-model.md) for how reusable profiles and project-specific harness instances relate.

## Product Implication

Architect Companion should not be a blank framework where every team must invent its own architecture model from scratch.

The product is useful because it ships with strong defaults:

- setup questions
- reusable profiles
- policies
- workflows
- documented tradeoffs
- reference examples
- exception handling
- target renderers

The main source of usefulness is not the generated files. It is the architectural knowledge behind them.
