# Effective Harness Model

The effective harness model is the resolved, validated contract consumed by
renderers and checks.

The current model resolves selected profiles, a project harness file, and
project boundary metadata.

## Inputs

Profiles live under `profiles/<profile-name>/profile.yml`:

```yaml
schemaVersion: 1
profile:
  name: cli
  version: 0.1.0
principles:
  - id: cli-as-adapter
    title: Treat the CLI layer as a thin adapter
    guidance: The CLI parses inputs, wires dependencies, and invokes core logic.
policies:
  - id: layer-boundaries
    title: Layer boundaries
    intent: Inner layers do not depend on outer layers.
    severity: error
    guidance: Core logic must not import CLI adapters or concrete I/O implementations.
workflows: []
heuristics: []
examples: []
```

Profiles may also contribute implementations:

```yaml
schemaVersion: 1
profile:
  name: typescript
  version: 0.1.0
principles: []
policies: []
workflows: []
heuristics: []
examples: []
implementations:
  - id: dependency-cruiser-cli-layer-boundaries
    policy:
      profile: cli
      id: layer-boundaries
    appliesTo:
      language: typescript
    engine: dependency-cruiser
    renderer: dependency-cruiser-config
```

Project harness configuration lives at `.architect-companion/harness.yml`:

```yaml
schemaVersion: 1
profiles:
  - name: cli
    version: 0.1.0
  - name: typescript
    version: 0.1.0
project:
  name: architect-companion
  languages:
    - typescript
boundaries: architecture/boundaries.yml
targets:
  agentsMd: true
  dependencyCruiser: true
```

Project boundary metadata lives at the path named by `boundaries`, relative to
`.architect-companion/`:

```yaml
schemaVersion: 1
boundaries:
  - name: cli
    path: src/cli.ts
    public_api: src/cli.ts
  - name: model
    path: src/model
    public_api: src/model
allowed_dependencies:
  cli:
    - model
```

## Merge Rules

- Harness-selected profile names and versions must match loaded profiles
  exactly.
- Profile order is preserved from the harness.
- Profile guidance sections merge by harness profile order, then local item
  ID.
- Item IDs are local to a profile; source profile is part of the effective
  identity.
- Harness `project.languages` activates matching implementations.
- Harness `targets` are the only source of target selection.
- Boundary metadata is project-owned and does not merge with profile data.

## Implementations

The effective model exposes only active implementations. An implementation is
active when its source profile is selected, its referenced policy profile is
selected, its `appliesTo.language` is present in `project.languages`, and the
referenced policy exists.

Unknown engines or renderers fail profile validation immediately. The current
supported implementation contract is:

```yaml
engine: dependency-cruiser
renderer: dependency-cruiser-config
```

The dependency-cruiser renderer currently supports one active implementation
per render and uses the project boundary metadata to produce dependency rules.

## Validation Rules

- `schemaVersion` must be `1`.
- Unknown fields fail validation.
- Names use lowercase letters, numbers, and hyphens, starting with a letter.
- Profile versions use a semantic-version-like shape.
- Paths are project-relative POSIX paths and may not escape the project.
- Profile guidance entries must use unique local `id` values and are sorted by
  `id` within each profile.
- Policy severities must be `advisory`, `warning`, or `error`.
- Boundary names must be unique.
- `allowed_dependencies` keys and values must reference known boundaries.

## Inspect Command

Use `inspect effective-model` to validate inputs and print the normalized
model:

```bash
architect-companion inspect effective-model
```

Useful options:

```bash
architect-companion inspect effective-model --project ./example --profiles ./profiles
```

The command is read-only. It does not render generated projections or run
architecture checks.

## Profile Lock

After the first successful `render`, the selected profiles are pinned in
`.architect-companion/profile.lock.yml`:

```yaml
schemaVersion: 1
profiles:
  - name: cli
    version: 0.1.0
    contentHash: sha256-<hex digest of profile.yml bytes>
  - name: typescript
    version: 0.1.0
    contentHash: sha256-<hex digest of profile.yml bytes>
```

`render` and `render --check` verify this lock against the currently resolved
profile sequence. A name, order, version, or content-hash mismatch fails with
an upgrade hint. `architect-companion upgrade-profile` rewrites the lock once
the profile changes have been reviewed.

See [Decision 0005](decisions/0005-profile-lock-for-adoption.md) for the
rationale.
