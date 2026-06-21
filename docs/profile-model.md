# Profile Model

See [Glossary](glossary.md) for shared terminology.

## Core Idea

Architectural knowledge lives in reusable profiles, and repositories compose
the profiles they need.

A profile is a versioned bundle. It may contribute guidance, policies,
workflows, examples, or policy implementations. Profiles are not categorized
as "architecture profiles" or "technology profiles" in the user model; they
are just composable bundles.

For example:

- `cli` describes how command-line applications should be structured.
- `modular-monolith` describes business-capability modules and ownership.
- `typescript` contributes TypeScript guidance and dependency-cruiser
  implementations for selected policies.

## Product Repository

The Architect Companion repository ships a profile library:

```text
profiles/
  cli/
    profile.yml
    README.md
  modular-monolith/
    profile.yml
    README.md
  typescript/
    profile.yml
    README.md
```

A profile can include:

- architectural principles
- policies
- policy implementations
- workflows
- review heuristics
- examples

Profile item IDs are local to the profile. `cli.layer-boundaries` and
`modular-monolith.module-boundaries` are different policies even though both
can be implemented with the same dependency-cruiser renderer.

## Consuming Repository

A project using Architect Companion selects multiple profiles in
`.architect-companion/harness.yml`:

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

The local project supplies facts the generic profiles cannot know:

- boundary names
- boundary paths
- public API entrypoints
- allowed dependencies between boundaries
- project languages
- selected render targets

Boundary facts live in `.architect-companion/architecture/boundaries.yml`:

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

## Policy Implementations

A policy says what should be true. An implementation says how a selected tool
can enforce or materialize that policy when the project context matches.

Example from `profiles/typescript/profile.yml`:

```yaml
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

An implementation appears in the effective model only when:

- the implementation's source profile is selected
- the referenced policy's source profile is selected
- `project.languages` contains the implementation language
- the referenced policy exists

Target selection does not determine whether an implementation appears in the
effective model. Targets determine whether the corresponding config files and CI
steps are rendered. Capability warnings report gaps such as an enforceable
dependency-cruiser implementation without the `dependencyCruiser` target, or a
selected `dependencyCruiser` target without a matching implementation.

Implementations that reference unselected policies or inactive languages are
ignored. Implementations that reference a selected but missing policy fail model
resolution.

## Why This Split

The old `typescript-cli` shape did not scale because every technology and
system-shape combination needed a dedicated profile. Composition lets a
repository select `cli + typescript`, while another selects
`modular-monolith + typescript`, and a future repository can select
`modular-monolith + java` without duplicating modular-monolith guidance.

Targets live in the harness, not in profiles. Profiles contribute reusable
knowledge and implementations; projects decide which generated outputs they
want.
