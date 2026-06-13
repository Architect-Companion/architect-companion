# 0003. Render Wires Existing Tools Into CI

## Status

Accepted

## Context

Architect Companion needs enforceable architecture checks, but many mature tools already exist for static analysis, dependency rules, linting, and architecture tests.

Examples include ArchUnit, dependency-cruiser, Semgrep, ESLint, Checkstyle, and SonarQube.

## Decision

Architect Companion should not become a custom universal static analyzer.

For code analysis, profiles declare implementations that map policies to existing engines for active project languages. Architect Companion renders the corresponding tool configuration and renders CI workflow steps that invoke the tool directly.

The deterministic enforcement chain is:

```text
render -> tool config + CI step
CI runner -> invokes the tool -> tool exits non-zero on violations
```

Architect Companion itself does not orchestrate engines at runtime or normalize their output. Each engine reports its own pass/fail through its own CI step.

Harness-owned verification is limited to `architect-companion render --check`, which detects stale generated targets.

## Consequences

- The project avoids rebuilding mature analyzers.
- Profiles need an engine implementation contract.
- Platform renderers stay thin: they express selected architecture-check commands as platform-specific steps.
- CI configuration carries the orchestration; Architect Companion does not.
- A normalized cross-engine report is a future advisory concern (likely under a `review` command), not a deterministic check concern.
