# Modular Monolith Profile

This profile captures opinionated guidance for building and evolving backend TypeScript modular monoliths with AI-assisted development.

It treats modules as business-capability boundaries, not technical layers. A module owns its behavior, data access, transactions, migrations, tests, public API, and event contracts behind an explicit entrypoint.

It includes:

- principles for business-capability modules, contract-first boundaries, private internals, and operational modularity
- policies for module boundaries, data ownership, public API shape, transaction boundaries, async event contracts, test placement, and migration ownership
- TypeScript implementation metadata for the dependency-cruiser module-boundary renderer
- workflows for adding a module, changing a boundary, extracting a module, and deprecating a public API
- review heuristics for module design, data and transactions, APIs and events, testing, migrations, coupling, and exception discipline
- good/bad examples covering imports, data access, public APIs, event payloads, transactions, test placement, and migrations

This profile content is structured in [profile.yml](profile.yml) so `inspect effective-model` can validate and expose it deterministically. Rendering and executable checks are separate CLI capabilities.
