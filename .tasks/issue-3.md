# Issue #3 — Publish package with programmatic API for all CLI commands

## Goal
Make the package installable as a private npm package with a stable programmatic API that exposes the core operations behind all five CLI commands.

## Context
- All target symbols already exist as named exports in their respective modules:
  - `runInit`, `InitError` → `src/init/init.ts`
  - `loadEffectiveHarnessModel`, `HarnessConfigError` → `src/model/effective-model.ts`
  - `renderEffectiveHarnessModel`, `RenderError` → `src/render/render.ts`
  - `runDoctor` → `src/diagnostics/doctor.ts`
  - `resolveProfileLockStatus`, `writeProfileLock`, `ProfileLockError` → `src/model/profile-lock.ts`
  - `defaultProfilesDir` → currently a private function in `src/cli.ts` (line 907)
- `tsconfig.json` already has `declaration: true`, `outDir: "dist"`, module/moduleResolution: NodeNext
- `package.json` has `"type": "module"` and `bin` entry but no `exports` field
- `src/io/` currently only contains `path-safety.ts` — io boundary has `allowed_dependencies: none`
- Tests live in `test/`, use vitest, import with `.js` extensions

## Decisions
- `defaultProfilesDir` will be moved to `src/io/profiles-dir.ts` (io is the right layer for fs path utilities). Path in compiled output changes from `../profiles` to `../../profiles` to account for the extra directory level.
- `src/index.ts` is the new public entry point; it re-exports from core modules only (no import from `cli.ts`).
- Key input/output types (e.g. `InitInputs`) are re-exported from `src/index.ts` so TypeScript consumers can type their call sites.
- `exports` field uses NodeNext-compatible format with `types`, `import`, `default` sub-conditions.

## Tasks

- [x] T1: Move `defaultProfilesDir` to `src/io/profiles-dir.ts`
  Scope: Create `src/io/profiles-dir.ts` exporting `defaultProfilesDir()`. Adjust relative URL path from `../profiles` to `../../profiles`. Update `src/cli.ts` to import from `./io/profiles-dir.js` instead of using the local private function. Update `src/io/index.ts` if it exists (or rely on direct imports).
  Done when: `src/cli.ts` no longer defines `defaultProfilesDir` locally; `src/io/profiles-dir.ts` exports it; build passes.

- [x] T2: Create `src/index.ts` as public entry point
  Scope: New file `src/index.ts` re-exporting: `runInit` + key input types from init, `loadEffectiveHarnessModel` + `serializeEffectiveHarnessModel` from model, `renderEffectiveHarnessModel` from render, `runDoctor` + `formatDoctorReport` + `doctorReportHasIssues` from diagnostics, `resolveProfileLockStatus` + `writeProfileLock` from model/profile-lock, `defaultProfilesDir` from io/profiles-dir. Also re-export all four error classes.
  Done when: `src/index.ts` compiles without errors and exports all required symbols.

- [x] T3: Update `package.json` exports field
  Scope: Add `"exports"` field to `package.json` with `"."` entry: `{ "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" }`. Verify `files` array includes `dist`. Existing `bin` must remain unchanged.
  Done when: `package.json` has a valid exports field; `npm run build` produces `dist/index.js` and `dist/index.d.ts`.

- [x] T4: Write smoke test for the public API
  Scope: Create `test/index.test.ts` that imports all exported symbols from `../src/index.js` and asserts they are defined (functions are typeof 'function', error classes are instantiable). No business logic to test — just that the contract is intact.
  Done when: `npm test` passes including the new test file.

- [x] T5: Run full check and verify architecture constraints
  Scope: Run `npm run check`. If architecture violations appear (e.g. `src/index.ts` importing from `cli.ts`), fix them. Confirm `defaultProfilesDir` move doesn't violate io boundary rules.
  Done when: `npm run check` exits 0.

## Patterns Introduced
- `src/index.ts` as a public API façade: a re-export-only entry point that aggregates symbols from inner layers without adding logic. Declared as `api` boundary in `boundaries.yml` with the same dependency allowances as the `cli` boundary (minus integrations/checks which are not exposed publicly).
- `src/io/profiles-dir.ts`: path-resolution utilities that depend only on Node.js built-ins belong in the `io` boundary.
- Option types that were previously unexported (`RunDoctorOptions`, `ResolveProfileLockOptions`) are now exported from their respective modules so public API consumers can type their call sites.

## Docs Status
- `CLAUDE.md` and other generated targets updated via `architect-companion render` to include the new `api` boundary.
- No ADR created (the decision is straightforward: thin re-export façade, no architectural tradeoffs).
- No arc42 docs folder exists in this repo.
