# Architect Companion

Architect Companion is an opinionated harness for architecture-aware agentic software engineering.

It provides reusable architecture profiles, renders tool-specific artifacts (AGENTS.md, Cursor rules, Claude Code skills, GitHub Actions, dependency-cruiser configs), and exposes a CLI and server for integrating these into any project.

## Architecture

```
packages/
  core/    — profile parser, effective model builder (shared)
  cli/     — architect-companion CLI (init, pull, inspect)
  server/  — Fastify API server (profiles, render, artifacts)
  ui/      — Next.js management UI (profile library, projects)
```

The server stores profiles and rendered artifacts. The CLI reads a project's `.architect-companion/harness.yml`, calls the render API, and writes artifacts to the correct locations based on the detected tooling.

## Installing the CLI Locally

### Prerequisites

- Node.js 22.13 or newer
- npm

### 1 — Clone and build

```bash
git clone https://github.com/embarc-de/architect-companion.git
cd architect-companion

npm ci
npm run build   # builds core → cli → server in order
```

### 2 — Link the CLI globally

```bash
npm link -w packages/cli
```

Verify:

```bash
architect-companion --version
architect-companion --help
```

### 3 — Start the server

```bash
npm start -w packages/server          # production (port 3000)
# or
npm run dev -w packages/server        # watch mode (rebuilds on change)
```

The server URL can be overridden with the `AC_SERVER_URL` environment variable (default: `http://localhost:3000`).

### 4 — (Optional) Start the management UI

```bash
npm run dev -w packages/ui            # http://localhost:3001
```

Use the UI to upload architecture profiles before running `init` in a project.

---

## Using the CLI in a Project

### Set up a project harness

Create `.architect-companion/harness.yml` in your project root:

```yaml
schemaVersion: 1
profile:
  name: modular-monolith
  version: 0.1.0
project:
  name: my-project         # overridden by git remote name at runtime
modules: architecture/modules.yml
```

Create `.architect-companion/architecture/modules.yml`:

```yaml
schemaVersion: 1
modules:
  - name: identity
    path: src/modules/identity
    public_api: src/modules/identity/index.ts
  - name: billing
    path: src/modules/billing
    public_api: src/modules/billing/index.ts
allowed_dependencies:
  billing:
    - identity
```

### Render artifacts on the server

Run from inside your project (git root is detected automatically):

```bash
architect-companion init
```

This reads `harness.yml`, calls `POST /api/render`, and stores the artifacts on the server.

### Apply artifacts to the project

```bash
architect-companion pull
```

This downloads all rendered artifacts and writes them to the correct locations based on detected tooling:

| Detected | Written |
|---|---|
| Always | `AGENTS.md`, `.dependency-cruiser.cjs` |
| `.github/` or GitHub remote | `.github/workflows/architect-check.yml` |
| `.claude/` or `CLAUDE.md` | `.claude/skills/<module>/skill.md` |
| `.cursor/` | `.cursor/rules/<module>.mdc` |

The project name is derived automatically from `git remote get-url origin`.

### Inspect the effective model (local, no server needed)

```bash
architect-companion inspect effective-model
architect-companion inspect effective-model --project ./path/to/project
```

---

## Development

```bash
npm ci
npm run build -w packages/core
npm run build -w packages/cli
npm run build -w packages/server
npm test -w packages/core
npm test -w packages/cli
```

The `data/` directory holds profiles and artifacts at runtime and is gitignored below the top-level subdirectories.
