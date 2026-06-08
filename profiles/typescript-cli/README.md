# TypeScript CLI Profile

This profile captures opinionated guidance for building layered, maintainable TypeScript command-line applications.

It treats the CLI as a thin adapter that translates input into requests for core business logic, keeping side-effects (like filesystem access and network calls) isolated.

It includes:

- principles for I/O isolation, CLI responsibilities, and strict dependency flow.
- policies preventing the CLI from bleeding into core logic and restricting dependencies.
- TypeScript implementation metadata for dependency-cruiser boundary checks.
- workflows for adding new commands and integrating external tools.
- review heuristics for testability and error handling.
- good/bad examples illustrating clean separation of logic from execution.

This profile content is structured in [profile.yml](profile.yml) so `inspect effective-model` can validate and expose it deterministically. Rendering and executable checks are separate CLI capabilities.
