# Glossary

## Architect Companion

The product and toolchain for defining, rendering, and checking an opinionated architecture harness for AI-assisted software engineering.

## Harness

The repository-local architecture guidance, workflows, policies, and target configuration used to guide developers, agents, and CI systems.

## Canonical Harness

The tool-independent source of truth for a specific repository, usually represented by `.architect-companion/`.

## Profile

A reusable, versioned package of architectural knowledge for a recurring system shape, such as a modular monolith, service-oriented backend, frontend application, or legacy modernization effort.

## Profile Library

The collection of reusable profiles shipped by Architect Companion, for example `profiles/modular-monolith/`.

## Effective Harness Model

The fully resolved model produced by combining profile defaults, project-specific harness configuration, local architecture facts, overrides, and target options.

## Renderer

A deterministic adapter that converts the effective harness model into a target-specific file or configuration format.

## Target

An agent, tool, or platform integration that can receive rendered output.

Examples:

- `AGENTS.md`
- `CLAUDE.md`
- Cursor rules
- Copilot instructions
- Claude Code hooks or commands
- Codex hooks or config
- GitHub Actions
- GitLab CI
- MCP resources or prompts

## Generated Projection

A target-specific generated file derived from the canonical harness, such as `AGENTS.md`, `.cursor/rules/*.mdc`, or `.github/workflows/architecture.yml`.

Generated projections are not sources of truth.

## Policy

An architectural rule, expectation, or constraint that may be advisory or enforcing.

Examples:

- modules may only depend on another module's public API
- public API changes require contract tests
- external dependencies require justification
- expired exceptions must fail CI

## Workflow

A recommended sequence of steps for developers or agents performing a recurring task, such as planning a change, adding a module, reviewing a refactor, or proposing an ADR.

## Heuristic

Architectural judgment that is useful for guidance or review but may be too contextual to enforce deterministically.

Examples:

- whether an abstraction is justified
- whether coupling increased in a subtle way
- whether a change should be reversible
- whether a design decision deserves an ADR

## Check

A deterministic verification step that can pass or fail repeatably.

The harness-owned check is `architect-companion render --check`, which
verifies that generated projections are fresh and that the profile lock
matches the resolved profile. External analysis engines run as their own CI
steps and report their own pass/fail.

## Architecture Check Command

A concrete command line selected from the effective harness model to run an architecture check.

Architecture check commands are target-neutral. Platform renderers such as GitHub Actions consume them and express them as platform-specific steps.

## Review

An advisory analysis of a change against the harness. Reviews may be AI-assisted, but they should not be treated as deterministic enforcement unless explicitly backed by checks.

## Engine

An existing tool used to implement a policy or check.

Examples:

- ArchUnit
- dependency-cruiser
- Semgrep
- ESLint
- Checkstyle
- SonarQube

## Integration

Architect Companion code that adapts the harness model to an external tool or platform.

Tool integrations know tool-specific details such as config shape, executable names, arguments, and result mapping. Platform integrations know platform-specific mechanics such as GitHub Actions workflow syntax.

## CI Adapter

A renderer or integration that expresses selected checks in a CI platform.

A CI adapter should stay thin: it should render platform mechanics and consume generic architecture check commands instead of duplicating tool-specific orchestration.

## Command Metadata

Structured information describing how to invoke an external engine.

Command metadata can include the executable, arguments, generated config file, input paths, output type, and result mapper.

## Orchestrator

The part of Architect Companion that invokes selected engines, collects results, and normalizes output.

## Fitness Function

An executable check that evaluates whether the codebase still satisfies an architectural expectation.

## Exception

A documented, owned, and preferably time-bounded deviation from a policy.

## Target Mechanics

The format-specific details needed to express harness intent in a particular target, such as Cursor rule syntax, GitHub Actions YAML, or Claude Code command layout.

## Architectural Taste

Opinionated judgment about what good architecture and good agentic engineering practice look like in a given context.

Architectural taste is encoded in profiles, policies, workflows, heuristics, examples, and exception models.

## Profile Lock

`.architect-companion/profile.lock.yml` records the resolved profile name,
version, and a SHA-256 hash of the profile content. Architect Companion uses the
lock to detect profile drift and to make profile upgrades explicit.

## Capability Warning

A non-fatal diagnostic from `render` or `doctor` that reports a gap between
selected targets, declared policies, and available implementations. Capability
warnings do not block rendering; they make adoption gaps visible.
