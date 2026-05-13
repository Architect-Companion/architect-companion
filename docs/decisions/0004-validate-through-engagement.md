# 0004. Validate Through Engagement, Not Pre-Launch Eval

## Status

Accepted

## Context

The core hypothesis behind Architect Companion is that an opinionated, packaged harness produces materially better agentic engineering outcomes than ad hoc guidance. A natural instinct is to validate that hypothesis before investing in infrastructure, by running side-by-side evaluations of agentic output with and without the harness.

Two evaluation framings were considered:

- **Harness vs no harness.** Trivially favorable. Any structured guidance, plus a dependency-cruiser check, outperforms an empty `AGENTS.md`. This shows that harnesses work in general, not that this harness works.
- **Harness vs another harness.** Genuinely informative but unmeasurable. "Better software" is taste-driven, the thing being sold is the taste itself, and no objective benchmark can adjudicate between opinionated profiles.

Conformance-style evaluation (does the agent follow the rules the profile states?) was also considered. It is measurable but weak: the profile defines the target, the engine enforces the target, so passing the check proves only that the mechanism transmits rules — not that the rules produce better software.

## Decision

Architect Companion is not validated through a pre-launch evaluation.

It is validated through customer engagements, where outcomes are judged by the customer's real work and the consultancy's reputation, and where each engagement deepens the profile library against real failure modes.

The artifact produced by the MVP vertical slice — a TypeScript modular-monolith profile rendered to `AGENTS.md`, dependency-cruiser configuration, and a GitHub Actions workflow — is itself the strongest demonstration material. Side-by-side diffs on representative tasks function as sales evidence, not as scientific measurement.

## Consequences

- The roadmap's MVP scope stays intact. No Phase 0 evaluation iteration is inserted.
- The first delivered profile must be deep enough to be recognizably opinionated. Generic principles are not sufficient; the profile must reflect specific tradeoffs, failure modes, and reference examples.
- Profile content is iterated against engagement feedback, not benchmark scores.
- Side-by-side demonstrations on representative agentic tasks are produced as customer-facing material, not as eval reports. Their purpose is to make the opinion visible, not to prove correctness.
- Architect Companion is honest about what it is: a packaged opinion delivered by a consultancy. It does not claim measurement it cannot deliver.
