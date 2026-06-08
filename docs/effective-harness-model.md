# Effective Harness Model

The effective harness model is the resolved, validated contract consumed by future renderers and checks.

The current model resolves a reusable profile, a project harness file, and project module metadata.

## Inputs

Profiles live under `profiles/<profile-name>/profile.yml`:

```yaml
schemaVersion: 1
profile:
  name: modular-monolith
  version: 0.2.0
defaults:
  stack: typescript
  targets:
    agentsMd: true
    claudeMd: false
principles:
  - id: module-ownership
    title: Modules own behavior behind public APIs
    guidance: Treat each module as the owner of its behavior and invariants.
policies:
  - id: module-boundaries
    title: Module boundaries
    intent: Modules may import another module only when declared in allowed_dependencies and through that module's public API.
    severity: error
    guidance: Cross-module imports must be declared in allowed_dependencies and target the dependency module public API.
    implementation:
      typescript:
        engine: dependency-cruiser
        renderer: dependency-cruiser-config
workflows:
  - id: change-module-boundary
    title: Change a module boundary
    steps:
      - Identify the affected modules.
      - Update public APIs before changing consumers.
heuristics:
  - id: architecture-review
    title: Architecture review
    questions:
      - Does every cross-module call use the target module public API?
examples:
  - id: module-access
    title: Module access
    good: import { findCustomer } from "../identity";
    bad: import { loadCustomerRow } from "../identity/internal/customer-repository";
```

Project harness configuration lives at `.architect-companion/harness.yml`:

```yaml
schemaVersion: 1
profile:
  name: modular-monolith
  version: 0.2.0
project:
  name: example-app
modules: architecture/modules.yml
targets:
  claudeMd: false
  cursor: false
```

Project module metadata lives at the path named by `modules`, relative to `.architect-companion/`:

```yaml
schemaVersion: 1
modules:
  - name: billing
    path: src/modules/billing
    public_api: src/modules/billing/index.ts
allowed_dependencies:
  billing:
    - identity
```

## Merge Rules

- The harness-selected profile name and version must match the loaded profile exactly.
- Harness `stack` overrides the profile default; a stack is required after merging.
- Harness targets override profile targets key by key.
- Known targets omitted from both inputs default to `false`.
- Profile principles, policies, workflows, heuristics, and examples are profile-owned.
- Module metadata is project-owned and does not merge with profile data in the current implementation.

## Profile Guidance Sections

Structured profile guidance is part of the effective model:

- `principles` are renderable architectural guidance.
- `policies` are architectural expectations. Policies may include implementation metadata for a supported stack and engine.
- `workflows` are repeatable steps for recurring architecture changes.
- `heuristics` are review questions for judgment that is not deterministic enough to enforce directly.
- `examples` provide compact good and bad examples for renderer output.

Only policies are candidates for future executable checks. The other sections are codified as deterministic, renderable guidance.

## Validation Rules

- `schemaVersion` must be `1`.
- Unknown fields fail validation.
- Names use lowercase letters, numbers, and hyphens, starting with a letter.
- Profile versions use a semantic-version-like shape.
- Paths are project-relative POSIX paths and may not escape the project.
- Profile guidance entries must use unique lowercase identifier `id` values and are sorted by `id`.
- Policy severities must be `advisory`, `warning`, or `error`.
- Policy implementation metadata supports `typescript` with `dependency-cruiser` and `dependency-cruiser-config`.
- Module names must be unique.
- `allowed_dependencies` keys and values must reference known modules.
- `allowed_dependencies` is interpreted as a strict module dependency allowlist for executable module-boundary checks.

## Inspect Command

Use `inspect effective-model` to validate inputs and print the normalized model:

```bash
architect-companion inspect effective-model
```

Useful options:

```bash
architect-companion inspect effective-model --project ./example --profiles ./profiles
```

The command is read-only. It does not render generated projections or run architecture checks.

## Profile Lock

After the first successful `render`, the effective profile is pinned in
`.architect-companion/profile.lock.yml`:

```yaml
schemaVersion: 1
profile:
  name: modular-monolith
  version: 0.2.0
  contentHash: sha256-<hex digest of profile.yml bytes>
```

`render` and `render --check` verify this lock against the currently resolved
profile. A name, version, or content-hash mismatch fails with an upgrade hint.
`architect-companion upgrade-profile` rewrites the lock once the profile change
has been reviewed.

See [Decision 0005](decisions/0005-profile-lock-for-adoption.md) for the
rationale.
