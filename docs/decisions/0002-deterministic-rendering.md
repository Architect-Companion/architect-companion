# 0002. Deterministic Rendering

## Status

Accepted

## Context

Architect Companion generates files that guide and constrain AI-assisted development. If the generation process were non-deterministic, the generated guidance would need another evaluation layer before it could be trusted.

## Decision

Rendering must be deterministic.

AI may suggest changes to the canonical harness, explain harness content, or support advisory review workflows. AI must not be part of the render path from the effective harness model to target files.

The render path is:

```text
profiles + project harness config
        |
        v
deterministic normalization and validation
        |
        v
effective harness model
        |
        v
deterministic renderers
        |
        v
generated target files
```

## Consequences

- Same input must produce the same output.
- Renderers should have golden-file tests.
- Generated files should contain headers indicating their source.
- `render --check` should fail when generated files are stale.
- AI-assisted review belongs outside the deterministic render path.
