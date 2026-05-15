# Effective Harness Model

The effective harness model is the resolved, validated contract consumed by future renderers and checks.

Iteration one supports one vertical slice: a reusable profile, a project harness file, and project module metadata.

## Inputs

Profiles live under `profiles/<profile-name>/profile.yml`:

```yaml
schemaVersion: 1
profile:
  name: modular-monolith
  version: 0.1.0
defaults:
  stack: typescript
  targets:
    agentsMd: true
policies: []
```

Project harness configuration lives at `.architect-companion/harness.yml`:

```yaml
schemaVersion: 1
profile:
  name: modular-monolith
  version: 0.1.0
project:
  name: example-app
modules: architecture/modules.yml
targets:
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
- Module metadata is project-owned and does not merge with profile data in iteration one.

## Validation Rules

- `schemaVersion` must be `1`.
- Unknown fields fail validation.
- Names use lowercase letters, numbers, and hyphens, starting with a letter.
- Profile versions use a semantic-version-like shape.
- Paths are project-relative POSIX paths and may not escape the project.
- Module names must be unique.
- `allowed_dependencies` keys and values must reference known modules.

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
