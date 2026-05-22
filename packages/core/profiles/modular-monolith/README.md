# Modular Monolith Profile

This profile captures opinionated guidance for building and evolving modular monoliths with AI-assisted development.

This profile defines one narrow module boundary policy for TypeScript modular monoliths.

It includes:

- a principle that modules own behavior behind explicit public APIs
- an enforcing module boundary policy
- TypeScript implementation metadata for a future dependency-cruiser renderer
- a workflow for changing module boundaries
- architecture review heuristics for coupling and boundary drift
- a good/bad example of cross-module access

This profile content is structured in [profile.yml](profile.yml) so `inspect effective-model` can validate and expose it deterministically. Rendering and executable checks are separate CLI capabilities.
