# Roadmap

## MVP Goal

Prove one end-to-end vertical slice for a TypeScript modular monolith.

The MVP should show that Architect Companion can:

- read a reusable profile
- apply project-specific harness configuration
- produce an effective harness model
- render agent and platform targets deterministically
- wire an existing analysis engine into CI
- detect stale generated files

## MVP Scope

The first implementation should include:

- a CLI entrypoint
- a minimal effective harness model
- a `modular-monolith` profile slice
- TypeScript as the first supported stack
- `AGENTS.md` renderer
- Cursor rules renderer
- dependency-cruiser config renderer
- GitHub Actions renderer
- deterministic `render`
- `render --check`

## Out Of Scope For MVP

The MVP should not include:

- provider-specific AI review execution
- hosted services or dashboards
- every agent integration
- every CI platform
- every language stack
- a custom static analysis engine
- interactive setup flows beyond what is needed for the vertical slice

## Iterations

### 0. Project Foundation

Goal: create a minimal executable project structure.

Deliverables:

- package and CLI project setup
- test runner
- formatting and linting
- repository CI for the project itself
- license and contribution basics

Exit criteria:

- `architect-companion --help` runs locally
- tests run in CI

### 1. Effective Harness Model

Goal: define the internal contract that all renderers and checks consume.

Deliverables:

- initial schema for profiles
- initial schema for `.architect-companion/harness.yml`
- initial schema for project module metadata
- deterministic merge rules
- validation rules
- `inspect effective-model`

Exit criteria:

- a sample profile and sample project config produce a stable effective model
- invalid configuration fails with useful errors

### 2. Modular Monolith Profile Slice

Goal: make the first profile useful in one narrow case.

Deliverables:

- one modular monolith principle
- one module boundary policy
- one workflow for changing module boundaries
- one architecture review heuristic
- one example of good and bad module access

Exit criteria:

- the profile contains enough information to render guidance and tool config for the first policy

### 3. Deterministic Rendering

Goal: render generated projections from the effective harness model.

Deliverables:

- renderer interface
- generated-file header
- file ownership rules
- `render`
- `render --check`
- golden-file tests

Exit criteria:

- rendering the same input twice produces identical output
- `render --check` fails when generated output is stale
- pre-existing unmanaged files are not overwritten silently

### 4. External Tool Integration

Goal: use an existing analysis engine instead of implementing static analysis.

Deliverables:

- dependency-cruiser policy implementation contract
- generated dependency-cruiser config
- command metadata for running dependency-cruiser
- result mapping shape

Exit criteria:

- a TypeScript module boundary violation can be detected by dependency-cruiser using generated config

### 5. CI Adapter

Goal: render CI configuration for the vertical slice.

Deliverables:

- GitHub Actions renderer
- generated workflow that runs the selected architecture check
- documented local and CI behavior

Exit criteria:

- a pull request can run the generated architecture check in GitHub Actions

### 6. Check Orchestration

Goal: introduce `check` only after the external-tool path is clear.

Deliverables:

- `check` validates harness-specific concerns
- `check` can verify generated files are fresh
- `check` can invoke configured external tools
- normalized output format
- deterministic exit codes

Exit criteria:

- `architect-companion check` can run the same relevant checks locally and in CI

### 7. Adoption Hardening

Goal: handle likely real-repository adoption cases.

Deliverables:

- clear conflict messages for existing files
- missing-tool diagnostics
- renderer capability warnings
- profile lock behavior
- basic upgrade path for profile changes

Exit criteria:

- a user can adopt the MVP in an existing TypeScript repository without silent file clobbering

## After MVP

Potential next expansions:

- Claude Code renderer
- Codex renderer
- GitLab CI renderer
- MCP support
- Java modular monolith slice using ArchUnit
- generated review checklists
- profile upgrade tooling
