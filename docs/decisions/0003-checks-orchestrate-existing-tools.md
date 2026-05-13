# 0003. Checks Orchestrate Existing Tools

## Status

Accepted

## Context

Architect Companion needs enforceable architecture checks, but many mature tools already exist for static analysis, dependency rules, linting, and architecture tests.

Examples include ArchUnit, dependency-cruiser, Semgrep, ESLint, Checkstyle, and SonarQube.

## Decision

Architect Companion should not become a custom universal static analyzer.

For code analysis, profiles should declare which existing engines implement a policy for a given stack. Architect Companion can render tool configuration, invoke configured tools, and normalize results.

`architect-companion check` should be:

```text
orchestrator + policy interpreter + result normalizer
```

It should directly implement only harness-specific checks, such as:

- generated targets are fresh
- required architecture metadata is present
- selected targets can be rendered
- profile versions are valid
- exceptions are not expired
- policies have implementations for the selected stack

## Consequences

- The project avoids rebuilding mature analyzers.
- Profiles need an engine implementation contract.
- Platform renderers can stay thin.
- CI adapters should invoke configured engines or `architect-companion check`.
- Check output should normalize policy id, severity, location, message, and source engine.

