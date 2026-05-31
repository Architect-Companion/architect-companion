# 0005. Profile Lock For Adoption

## Status

Accepted

## Context

Architect Companion ships reusable profiles. A consuming repository selects a profile
by `name` and `version` from its `harness.yml`. The profile content lives outside the
repository (in the installed package) and can change when the package is upgraded.

Without an integrity record, a profile content change would silently propagate into
every consumer on the next install. The renderer would happily produce different
guidance and tool configuration from the same `harness.yml`.

The adoption-hardening iteration of the MVP roadmap asks for "profile lock behavior"
and a "basic upgrade path for profile changes" so that teams can adopt Architect
Companion in real repositories without surprise drift.

## Decision

Architect Companion records the resolved profile in
`.architect-companion/profile.lock.yml`. The lock pins:

- `profile.name`
- `profile.version`
- `profile.contentHash` (SHA-256 of `profile.yml` bytes)

`render` verifies the lock against the currently resolved profile:

- Missing lock: `render` creates the lock as part of its first run; `render --check`
  reports the missing lock as stale and exits non-zero.
- Matching lock: `render` proceeds normally.
- Stale lock (different name, version, or content hash): `render` and `render --check`
  refuse to run and instruct the user to review the change with
  `architect-companion upgrade-profile`.

The new `architect-companion upgrade-profile` command rewrites the lock to the
currently resolved profile. The new `architect-companion doctor` command surfaces
lock status alongside other adoption diagnostics.

## Consequences

- Reproducible rendering: the same lock plus the same Architect Companion install
  reproduce the same generated targets.
- CI catches silent profile drift via the existing `render --check` step.
- Profile upgrades become explicit, reviewable code changes through
  `upgrade-profile`.
- The lock file is committed to the consuming repository.
- The lock is YAML, mirrors the harness directory style, and carries a generated
  marker so contributors do not edit it by hand.
