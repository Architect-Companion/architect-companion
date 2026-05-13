# 0001. Agent-Neutral Harness

## Status

Accepted

## Context

Teams may use different AI-assisted development tools across repositories or even within the same organization. Architect Companion should not require a single coding agent, editor, or CI platform.

## Decision

Architect Companion uses a tool-independent canonical harness as the source of truth.

Repository-specific harness configuration lives in `.architect-companion/`. Reusable architectural knowledge lives in `profiles/`. Generated target files are projections of the effective harness model.

The source/target relationship is:

```text
profiles + .architect-companion/
        |
        v
effective harness model
        |
        v
generated target files
```

Targets may include `AGENTS.md`, `CLAUDE.md`, Cursor rules, Copilot instructions, Codex config, Claude Code hooks, MCP resources, GitHub Actions, or GitLab CI.

## Consequences

- The core model is not tied to a single agent.
- Multiple renderers are needed.
- Renderers must express target mechanics, not architectural intent.
- Some targets will support fewer capabilities than others.
- The project needs a renderer capability model before broad target support.

