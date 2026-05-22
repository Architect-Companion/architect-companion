# 0006. npm Workspaces Monorepo

## Status

Accepted

## Context

The original codebase was a flat single-package TypeScript project containing only the CLI
and effective harness model. Adding a server, a management UI, and a shared core library
required a decision on how to manage multiple related packages.

Options considered were a monorepo with npm workspaces, a monorepo with a dedicated tool
such as Nx or Turborepo, and separate repositories per package.

## Decision

Architect Companion uses a single repository with npm workspaces and the following package
layout:

- `packages/core` — profile parser, effective model builder, shared types
- `packages/cli` — the `architect-companion` binary
- `packages/server` — Fastify API server (profiles, render, artifacts)
- `packages/ui` — Next.js management UI

The root `package.json` is workspace-only (private, no bin). Build ordering is handled
explicitly: `core → cli → server`. The `packages/ui/.next/` build output is gitignored
via a package-local `.gitignore`.

`packages/core` is intentionally small and dependency-light because it is imported by both
the CLI (local execution) and the server (API execution).

## Consequences

- Shared types and parsing logic in `core` avoid duplication between CLI and server.
- The `prepare` lifecycle script must not be used in packages that depend on `core`,
  because `npm install` runs `prepare` before cross-package builds complete.
- A single `npm ci` at the root installs all packages.
- The CLI can be linked globally with `npm link -w packages/cli`.
- Adding a new package (e.g., a VS Code extension) requires only a new workspace entry.
