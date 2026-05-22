# 0008. Fastify and Next.js as Server and UI Stack

## Status

Accepted

## Context

The server-side render pipeline requires an HTTP API server and a management UI for
uploading profiles and inspecting rendered artifacts. Technology choices were needed for
both layers.

For the API server, the main options were Express, Fastify, and Hono. For the UI, Next.js
and plain Vite/React were considered.

A native SQLite binding (`better-sqlite3`) was initially considered for storage but was
ruled out because its native addon does not compile under Node.js 26 due to a removed V8
API (`GetPrototype`). Filesystem storage was chosen as the initial persistence layer.

## Decision

The API server uses **Fastify 5** with TypeScript ESM. Fastify was chosen for its
performance, its first-class TypeScript support, and its plugin system that maps cleanly
to the domain-sliced server layout (`profiles/`, `render/`, `artifacts/`).

The management UI uses **Next.js 15** (App Router) with **Tailwind CSS v4**. Next.js
rewrites proxy all `/api/*` requests to the Fastify server, eliminating CORS configuration.
The UI runs on port 3001; the server runs on port 3000.

**Drizzle ORM** is included as a server dependency for a future database layer. It was
chosen over Prisma for its lightweight code-gen model and TypeScript-first design. The ORM
is not yet wired to any database; filesystem storage is used until a Node.js 26-compatible
SQLite driver is available or a PostgreSQL connection is introduced.

## Consequences

- The server and UI are separate processes with separate build pipelines.
- The Next.js rewrite pattern means the UI's `next.config.ts` must be updated if the
  server URL or port changes (`AC_API_URL` environment variable).
- `better-sqlite3` must not be used as long as Node.js 26 is the runtime, because its
  native addon is incompatible.
- The domain-sliced server layout (`profiles/`, `render/`, `artifacts/`, `renderers/`)
  matches the Fastify plugin pattern: each domain registers its own routes.
