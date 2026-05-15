# Contributing

Architect Companion is in the product-definition and early foundation stage.

## Local Development

Use Node.js 22.13 or newer and npm.

```bash
npm ci
npm run check
```

`npm run check` is the local equivalent of the repository CI workflow. It checks formatting,
linting, TypeScript types, tests, and the production build.

## Project Conventions

- Keep the README concise and product-facing.
- Put durable rationale and tradeoffs in `docs/`.
- Keep examples generic, fictional, and suitable for a public repository.
- Do not add confidential company, system, repository, or engagement details.
- Prefer small, inspectable changes over broad framework decisions at this stage.

## Documentation

Use `docs/README.md` as the documentation map. Add decision records under
`docs/decisions/` when a choice should remain stable across future discussions.
