# Init Command

`architect-companion init` bootstraps `.architect-companion/` in a consuming
repository from a selected profile and renders the enabled targets. It is the
entry point most teams use first.

See [Harness Model](harness-model.md) for the broader CLI surface and
[Profile Model](profile-model.md) for what a profile contributes.

## Contract

A single invocation of `init` is atomic:

1. **Pre-flight.** Validate inputs, confirm `.architect-companion/` does not
   already exist, ensure every would-be render-target path is either missing
   or already carries the generated-file marker. All conflicts are reported in
   a single error message; no files are written.
2. **Scaffold.** Write `.architect-companion/harness.yml` and
   `.architect-companion/architecture/modules.yml`.
3. **Lock.** Compute and write `.architect-companion/profile.lock.yml`.
4. **Render.** Invoke the render pipeline to produce the enabled target files.
5. **Report.** Print each created file and a `Next:` line pointing to module
   declaration.

If any step after pre-flight fails — including a SIGINT (Ctrl-C) — `init`
rolls back every file and directory it created. The working tree is left as
it was before the command ran. Best-effort rollback covers normal error
paths; SIGKILL or power loss can still leave partial state and require a
manual `rm -rf .architect-companion/`.

`init` refuses to run when `.architect-companion/` already exists. Re-initing
requires deleting the directory first; ongoing maintenance lives in
[`render`](harness-model.md#cli-shape) and `upgrade-profile`.

## Flags

| Flag                             | Default                                                                | Purpose                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `--profile <name>`               | auto-pick if exactly one profile is installed                          | Choose the profile to scaffold from. Validated against installed profiles at init time.                |
| `--stack <name>`                 | profile's `defaults.stack`                                             | Choose the technology stack. Validated against the profile's supported stacks.                         |
| `--project-name <name>`          | derived from the project directory name (lowercased, hyphen-separated) | Value written to `project.name` in `harness.yml`.                                                      |
| `--target <key>` (repeatable)    | profile defaults                                                       | Enable a render target on top of profile defaults.                                                     |
| `--no-target <key>` (repeatable) | profile defaults                                                       | Disable a render target relative to profile defaults.                                                  |
| `--no-render`                    | render runs                                                            | Scaffold and write the profile lock, but skip the render step. Run `architect-companion render` later. |
| `--dry-run`                      | writes files                                                           | Show the plan (would-be files and their contents) and exit without writing.                            |
| `--project <dir>`                | current working directory                                              | Consuming-project root.                                                                                |
| `--profiles <dir>`               | shipped `profiles/` directory                                          | Profile discovery root.                                                                                |

Conflicting target selections — for example `--target cursor --no-target cursor` — are
rejected before any work begins.

Only target keys returned by the installed `knownTargetKeys` set are accepted;
unknown keys fail fast with the allowed list.

## Behavior in detail

### Profile resolution

`init` reads the profiles directory and treats each subdirectory containing a
`profile.yml` as an installed profile. When `--profile` is omitted:

- one installed profile → auto-pick it (no prompt today; the wizard layer will
  surface a single-option select once present).
- multiple installed profiles → fail with the list and instruct the user to
  pass `--profile`.

When `--profile` is given, the named profile must exist; the profile's
declared `profile.name` field must match the directory name.

### Stack resolution

`init` resolves the stack in this order:

1. `--stack` if given.
2. The profile's `defaults.stack`.
3. Error: no stack can be inferred.

When `--stack` is given alongside a profile that declares a different stack,
`init` refuses. The current `modular-monolith` profile supports `typescript`
only.

### Target merging and what lands in `harness.yml`

The full target set is computed as `profile defaults overridden by --target /
--no-target`. The render step uses this merged set.

`harness.yml` records **only the overrides** — values where the user's choice
differs from the profile default. Everything that matches the profile default
is omitted. This keeps `harness.yml` short and lets profile defaults evolve
under future upgrades.

### Generated-file marker

`init` reuses the same generated-file marker as `render`. A pre-existing file
at a render-target path is treated as a conflict unless it already carries
the marker line `Generated by Architect Companion. Edit .architect-companion/
instead.` near the top. See
[ADR 0006](decisions/0006-generated-file-safety-boundary.md).

### Profile lock

`init` writes `.architect-companion/profile.lock.yml` as part of the same
transaction. This pins the resolved profile's content hash so subsequent
renders detect drift; see
[ADR 0005](decisions/0005-profile-lock-for-adoption.md).

### `--dry-run`

Reports what would happen and exits 0 if pre-flight passes (non-zero
otherwise). It previews the bytes of the two files `init` itself would write
(`harness.yml` and `modules.yml`) and lists the paths render would produce.
It does not preview rendered content — `render` is deterministic; run it
separately to inspect target output if needed.

## Failure modes

| Condition                                              | Result                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `.architect-companion/` already exists                 | Refuse. Suggest `upgrade-profile` / `render` for existing harnesses.        |
| Pre-existing unmarked file at a render-target path     | Refuse with the full list of conflicting paths and a pointer to the marker. |
| `--profile <name>` not installed                       | Refuse with the missing profile name.                                       |
| `--target` or `--no-target` references an unknown key  | Refuse with the allowed key list.                                           |
| `--target` and `--no-target` name the same key         | Refuse.                                                                     |
| `--stack <name>` not supported by the selected profile | Refuse with the profile's supported stack.                                  |
| SIGINT during writes                                   | Roll back, exit 130, print `init cancelled.`                                |
| Render error mid-flight                                | Roll back, exit 1, print the underlying error.                              |

## Implementation

Lives in [`src/init/`](../src/init/):

- `init.ts` — orchestrator. Owns the rollback tracker, the SIGINT handler, and
  the render invocation.
- `preflight.ts` — pre-flight checks: existing-directory refusal, profile and
  stack validation, target merging, render-target conflict detection.
- `scaffold.ts` — formatters and writers for `harness.yml` and `modules.yml`.
- `errors.ts` — `InitError` class.

The CLI parses init's flag surface in `src/cli.ts:runInitCommand` and calls
into `runInit`.

The pre-flight uses `getRendererOutputs(targets)` exported from
[`src/render/render.ts`](../src/render/render.ts), which mirrors the logic
that the render pipeline uses internally — there is one source of truth for
which renderers a target enables.

## Dependencies

Phase 1 (flag-driven init) uses only Node's built-ins and the existing `yaml`
dependency. The wizard layer adds `@clack/prompts`. The dependency
carve-out: prompt UX is leaf-level and does not shape the harness model,
which makes it acceptable under the project's general preference for
avoiding solo-maintainer dependencies.
