# Profile Model

See [Glossary](glossary.md) for shared terminology.

## Core Idea

Architectural knowledge lives in profiles.

A profile is a versioned package of architectural guidance for a recurring system shape, such as a modular monolith, service-oriented backend, frontend application, or legacy modernization effort.

For example, the knowledge about "how to build a good modular monolith" should live in a `modular-monolith` profile.

## Two Locations

There are two different places to think about:

```text
profiles/                       reusable profiles shipped by Architect Companion
.architect-companion/           project-specific harness instance in a consuming repo
```

The first is the product's reusable knowledge base.

The second is the consuming project's local configuration, selected profile, overrides, and project-specific architecture facts.

## Product Repository

The Architect Companion repository can ship profiles like this:

```text
profiles/
  modular-monolith/
    profile.yml
    README.md
    architecture/
      boundaries.yml
      layering.yml
      module-catalogue.yml
    policies/
      dependencies.yml
      public-api.yml
      database-access.yml
      testing.yml
      adr-triggers.yml
    workflows/
      plan-change.md
      add-module.md
      change-module-boundary.md
      review-change.md
      propose-adr.md
    heuristics/
      architecture-review.md
      modularity-review.md
      refactoring-review.md
    examples/
      good-module.md
      bad-module.md
      boundary-exception.md
```

This is where reusable architectural knowledge lives.

The profile should encode:

- architectural principles
- preferred boundaries
- allowed and discouraged dependencies
- expected testing strategy
- change workflows
- ADR triggers
- review heuristics
- examples of good and bad implementation choices
- exception handling guidance

## Consuming Repository

A project using Architect Companion could contain:

```text
.architect-companion/
  harness.yml
  profile.lock.yml
  overrides.yml
  architecture/
    components.yml
    ownership.yml
    boundaries.yml
    exceptions.yml
```

The consuming project does not need to reinvent the modular monolith profile. It selects it, locks a version, and adds project-specific facts.

For example:

```yaml
# .architect-companion/harness.yml
profile:
  name: modular-monolith
  version: 0.1.0

targets:
  agentsMd: true
  claudeCode: true
  cursor: true
  copilot: true
  githubActions: true
```

The local project then adds information the generic profile cannot know:

- actual modules
- actual owners
- actual dependency exceptions
- actual test commands
- actual technology choices
- actual migration constraints

## Reference, Copy, Or Vendor

There are three possible ways to use a profile:

1. Reference it from the installed Architect Companion package.
2. Copy it into `.architect-companion/` during initialization.
3. Vendor a locked snapshot for maximum reproducibility.

The preferred default should probably be a locked snapshot with explicit upgrade support:

```bash
architect-companion init --profile modular-monolith
architect-companion profile update
architect-companion render
```

That makes generated outputs reproducible and lets teams review profile upgrades like normal code changes.

## What "Good Modular Monolith" Means

The modular monolith profile should not say only "keep modules clean." It should make the opinion operational.

It should answer questions like:

- What is a module?
- What can cross module boundaries?
- Can modules share database tables?
- Where do commands, queries, events, and adapters live?
- Which dependencies are allowed between modules?
- When should a new module be introduced?
- When should a module be split?
- When should an ADR be required?
- What tests prove that module boundaries still hold?
- Which shortcuts are acceptable temporarily, and how are they tracked?

That is the architectural knowledge.

## Product Implication

The profile library is one of the main assets of Architect Companion.

The CLI and renderers make profiles usable across agents and CI systems, but the profile content is where the opinion lives.

Profiles may also declare which existing engines implement a policy for a given stack. For example, a TypeScript modular monolith profile may render dependency-cruiser configuration, while a Java profile may render or guide ArchUnit checks. Architect Companion should encode the intent and wiring, not rebuild those analyzers.
