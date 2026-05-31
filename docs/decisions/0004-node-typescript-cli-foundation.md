# 0004. Node TypeScript CLI Foundation

## Status

Accepted

## Context

The project needs a minimal executable foundation that fits the first
supported stack (a TypeScript modular monolith) without introducing
implementation dependencies before the model, renderers, and checks take
shape.

## Decision

Architect Companion uses a Node.js and TypeScript CLI foundation with npm as the package
manager.

The package exposes an `architect-companion` binary, uses TypeScript ESM, and supports
currently maintained Node.js LTS lines starting at Node.js 22.13.

The project uses Vitest for tests, ESLint for linting, Prettier for formatting, GitHub
Actions for repository CI, and the MIT License for open-source distribution.

## Consequences

- The first executable surface is available before model and renderer implementation.
- The project can add deterministic render and check commands without changing the package
  foundation.
- Contributors need a maintained Node.js version and npm.
- Runtime dependencies remain minimal until concrete needs arise.
