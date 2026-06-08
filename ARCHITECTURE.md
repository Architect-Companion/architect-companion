# Architecture

Architect Companion is a CLI that turns reusable architectural knowledge into
deterministic guidance and configuration for AI-assisted development.

This document is the single-page map. Detailed rationale and tradeoffs live in
[`docs/`](docs/README.md); stable decisions live in
[`docs/decisions/`](docs/decisions/README.md).

## System Context

The system has two inputs, one resolved model, and many target outputs.

```text
profiles/<name>/profile.yml            reusable architectural knowledge
.architect-companion/harness.yml       project-specific harness instance
.architect-companion/<modules>.yml     project module metadata
            |
            v
  effective harness model              resolved, validated contract
            |
            +--> deterministic renderers           AGENTS.md, CLAUDE.md, Cursor rules, ...
            +--> external tool config renderers    .dependency-cruiser.cjs
            +--> CI platform renderers             .github/workflows/architecture.yml
            +--> architecture check commands       consumed by CI renderers
```

Generated outputs are projections of the effective model. The canonical source
is the harness instance plus the selected profile; generated files are not a
second source of truth.

See [`docs/harness-model.md`](docs/harness-model.md) and
[`docs/effective-harness-model.md`](docs/effective-harness-model.md).

## Component Model

The implementation is a small TypeScript ESM package organized as follows.

| Layer        | Path                | Responsibility                                                                            |
| ------------ | ------------------- | ----------------------------------------------------------------------------------------- |
| CLI          | `src/cli.ts`        | Argument parsing, command dispatch, exit codes, error mapping.                            |
| Init         | `src/init/`         | Scaffold `.architect-companion/`, write the profile lock, invoke render; atomic rollback. |
| Model        | `src/model/`        | Load, validate, merge profile + harness + module metadata; profile lock.                  |
| Render       | `src/render/`       | Orchestrate selected renderers, enforce generated-file safety.                            |
| Renderers    | `src/renderers/`    | Target-specific projections (e.g. GitHub Actions workflow).                               |
| Integrations | `src/integrations/` | External-engine adapters (e.g. dependency-cruiser config + commands).                     |
| Checks       | `src/checks/`       | Target-neutral architecture check commands consumed by CI renderers.                      |
| Diagnostics  | `src/diagnostics/`  | Doctor and capability-warning helpers behind the `doctor` command.                        |
| I/O          | `src/io/`           | Shared filesystem safety primitives (path containment, symlink rejection).                |

Dependencies flow downward only: renderers and integrations depend on the
model; the model has no inbound dependency on either. The CLI is the only
entrypoint that wires them together.

## Data Flow

`architect-companion init`:

1. Pre-flight: refuse if `.architect-companion/` already exists; refuse if any
   would-be render-target path conflicts with an existing unmarked file.
2. Write `.architect-companion/harness.yml` and
   `.architect-companion/architecture/modules.yml` (an empty-but-valid module
   stub).
3. Resolve the effective model, write `.architect-companion/profile.lock.yml`.
4. Invoke the render pipeline.
5. Any failure or SIGINT rolls back every file the command created.

See [`docs/init.md`](docs/init.md) for the full contract.

`architect-companion inspect effective-model`:

1. Read `harness.yml`, the named profile, and module metadata.
2. Validate each file against its schema (unknown fields are errors).
3. Merge profile defaults with harness overrides.
4. Print the resolved model as JSON.

`architect-companion render` (and `render --check`):

1. Resolve the effective model (as above) and verify the profile lock.
2. Select renderers whose target is enabled in `model.targets`.
3. For each renderer, produce content, enforce the generated-file marker, and
   either write the file or (with `--check`) report stale / missing outputs.
4. Refuse to overwrite any file that does not carry the marker.

`architect-companion doctor` reports adoption diagnostics (profile lock status,
capability warnings for selected-but-unsupported targets, missing tools).
`architect-companion upgrade-profile` rewrites the profile lock to the
currently resolved profile.

External-engine integration (current: dependency-cruiser):

1. The profile declares an `implementation` block on a policy:
   `{ engine: dependency-cruiser, renderer: dependency-cruiser-config }`.
2. The integration renders `.dependency-cruiser.cjs` from module metadata and
   `allowed_dependencies`.
3. The check-command layer emits a target-neutral invocation
   (`npx --no-install depcruise --config .dependency-cruiser.cjs <paths>`).
4. The GitHub Actions renderer consumes that command and emits a workflow step
   that invokes the engine directly. Architect Companion does not orchestrate
   engines at runtime.

See [`docs/rendering-and-checks.md`](docs/rendering-and-checks.md).

## Architectural Properties

These properties are load-bearing — changes that violate them should go through
an ADR.

- **Agent-neutral source of truth.** The canonical model is not tied to any one
  agent or CI platform. See ADR
  [0001](docs/decisions/0001-agent-neutral-harness.md).
- **Deterministic rendering.** No AI in the render path; the same input
  produces the same output. See ADR
  [0002](docs/decisions/0002-deterministic-rendering.md).
- **Render wires existing tools into CI; engines run themselves.** Profiles
  declare which existing engine implements a policy for a given stack;
  rendered CI steps invoke the engine directly, and Architect Companion does
  not orchestrate or normalize engine output at runtime. See ADR
  [0003](docs/decisions/0003-checks-orchestrate-existing-tools.md).
- **Profile lock pins resolved profile content.** A SHA-256 content hash of
  the resolved profile is recorded in `.architect-companion/profile.lock.yml`;
  `render` refuses to run on a stale lock, and `upgrade-profile` is the only
  way to advance it. See ADR
  [0005](docs/decisions/0005-profile-lock-for-adoption.md).
- **Generated-file safety boundary.** Renderers own whole files, generated
  files carry an explicit marker, and unmarked files are never overwritten.
  See ADR [0006](docs/decisions/0006-generated-file-safety-boundary.md).

## Extension Points

Adding a renderer (target-specific projection):

1. Add target metadata to `src/targets/target-registry.ts`, including the
   target key and generated output path.
2. Add renderer code under `src/renderers/` (or `src/render/render.ts` for the
   simplest cases) and bind it from the render layer.
3. Ensure the rendered content includes the generated-file marker.
4. Add a golden-file test under `test/`.

Adding an external-engine integration:

1. Add an adapter under `src/integrations/` exposing a config renderer and
   command metadata.
2. Extend the policy implementation enums in
   `src/model/effective-model.ts` (`supportedPolicyEngines`,
   `supportedPolicyRenderers`).
3. Surface the invocation in `src/checks/architecture-check-commands.ts` so CI
   renderers pick it up automatically.

Adding a target key:

1. Add the key to `src/targets/target-registry.ts`.
2. Either provide a renderer or accept that the target is declared but not yet
   renderable; the render path will report unsupported selections.

## Repository Layout

```text
src/             implementation (CLI, model, render, renderers, integrations, checks)
test/            vitest tests and fixtures, including golden-file outputs
profiles/        reusable architectural knowledge shipped by the product
docs/            durable design notes and rationale
docs/decisions/  accepted architecture decisions (ADRs)
scripts/         developer tooling not shipped to users
```

## Current Scope

The harness covers the TypeScript modular monolith: effective model,
modular-monolith profile, deterministic render, profile lock, adoption
diagnostics, dependency-cruiser integration, and a GitHub Actions adapter. A
dedicated `architect-companion check` command is intentionally out of scope;
engines report pass/fail through their own CI steps.
