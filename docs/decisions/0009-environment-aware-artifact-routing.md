# 0009. Environment-Aware Artifact Routing in the CLI

## Status

Accepted

## Context

The server renders artifacts for all supported targets on every render call. A single
project may be developed by contributors using different local tooling: some use Cursor,
some Claude Code, some both, and some neither. Writing all artifacts unconditionally would
pollute projects with files for tools that are not in use.

An alternative is to configure which targets to apply in `harness.yml`. This is explicit
but requires upfront configuration and must be kept in sync as tooling changes.

## Decision

The CLI detects installed tooling by inspecting the local project and the git remote URL,
then writes only the artifacts that match what is present:

| Condition | Artifacts applied |
|---|---|
| Always | `AGENTS.md`, `.dependency-cruiser.cjs` |
| `.github/` directory or `github.com` remote | `.github/workflows/architect-check.yml` |
| `.claude/` directory or `CLAUDE.md` present | `.claude/skills/<module>/skill.md` |
| `.cursor/` directory present | `.cursor/rules/<module>.mdc` |

Detection is heuristic and runs at apply time (`render` and `pull` commands). It does not
require any configuration.

Claude Code skills follow the convention `.claude/skills/<skillname>/skill.md` with one
directory per module. This matches the path structure expected by Claude Code for
project-level skill definitions.

`AGENTS.md` is always written to the project root because it is the tool-neutral AI
instruction file and is readable by all coding agents (Claude Code, Cursor, Codex, etc.).

## Consequences

- No target configuration is needed in `harness.yml` for routing purposes; the `targets`
  field only controls which artifacts the server generates.
- Developers do not need to coordinate tooling configuration. The CLI adapts to whatever
  each contributor has set up.
- If a contributor adds Cursor to their workflow after the initial setup, they run
  `architect-companion pull` again and the Cursor rules are written.
- The detection is local-state-based and is not aware of team-wide tooling agreements.
  A team that wants to enforce specific targets should document that in `harness.yml`
  and add a `doctor` check in a future iteration.
