import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadEffectiveHarnessModel } from "../src/model/effective-model.js";
import {
  GENERATED_FILE_MARKER,
  RenderError,
  renderEffectiveHarnessModel,
} from "../src/render/render.js";

const profilesDir = fileURLToPath(new URL("../profiles", import.meta.url));
const sampleProjectDir = fileURLToPath(new URL("fixtures/sample-project", import.meta.url));
const goldenDir = fileURLToPath(new URL("fixtures/golden", import.meta.url));

describe("renderEffectiveHarnessModel", () => {
  it("renders AGENTS.md from the effective model", async () => {
    const projectDir = copySampleProject();

    try {
      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      const results = await renderEffectiveHarnessModel({ model, projectDir });

      expect(results).toEqual([
        {
          outputPath: "AGENTS.md",
          status: "created",
          target: "agentsMd",
        },
      ]);
      expect(readFileSync(join(projectDir, "AGENTS.md"), "utf8")).toBe(
        readFileSync(join(goldenDir, "AGENTS.md"), "utf8"),
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("renders Cursor rules from the effective model", async () => {
    const projectDir = copySampleProject();
    writeHarness(
      projectDir,
      `targets:
  agentsMd: false
  cursor: true
`,
    );

    try {
      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      const results = await renderEffectiveHarnessModel({ model, projectDir });

      expect(results).toEqual([
        {
          outputPath: ".cursor/rules/architect-companion.mdc",
          status: "created",
          target: "cursor",
        },
      ]);
      expect(
        readFileSync(join(projectDir, ".cursor", "rules", "architect-companion.mdc"), "utf8"),
      ).toBe(readFileSync(join(goldenDir, "architect-companion.mdc"), "utf8"));
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("is deterministic across repeated renders", async () => {
    const projectDir = copySampleProject();

    try {
      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });

      await renderEffectiveHarnessModel({ model, projectDir });
      const first = readFileSync(join(projectDir, "AGENTS.md"), "utf8");
      const secondResults = await renderEffectiveHarnessModel({ model, projectDir });
      const second = readFileSync(join(projectDir, "AGENTS.md"), "utf8");

      expect(secondResults).toEqual([
        {
          outputPath: "AGENTS.md",
          status: "unchanged",
          target: "agentsMd",
        },
      ]);
      expect(second).toBe(first);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("reports stale generated files without rewriting them in check mode", async () => {
    const projectDir = copySampleProject();
    const staleContent = `<!-- ${GENERATED_FILE_MARKER} -->

stale
`;

    try {
      writeFileSync(join(projectDir, "AGENTS.md"), staleContent);

      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      const results = await renderEffectiveHarnessModel({ check: true, model, projectDir });

      expect(results).toEqual([
        {
          outputPath: "AGENTS.md",
          reason: "content differs",
          status: "stale",
          target: "agentsMd",
        },
      ]);
      expect(readFileSync(join(projectDir, "AGENTS.md"), "utf8")).toBe(staleContent);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("refuses to overwrite unmanaged files", async () => {
    const projectDir = copySampleProject();

    try {
      writeFileSync(join(projectDir, "AGENTS.md"), "# Handwritten agent notes\n");

      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      await expect(renderEffectiveHarnessModel({ model, projectDir })).rejects.toThrow(RenderError);
      await expect(renderEffectiveHarnessModel({ model, projectDir })).rejects.toThrow(
        /refusing to overwrite/,
      );
      expect(readFileSync(join(projectDir, "AGENTS.md"), "utf8")).toBe(
        "# Handwritten agent notes\n",
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("refuses to write through a symlinked output file", async () => {
    const projectDir = copySampleProject();
    const outsideDir = mkdtempSync(join(tmpdir(), "architect-companion-outside-"));
    const outsideFile = join(outsideDir, "AGENTS.md");

    try {
      symlinkSync(outsideFile, join(projectDir, "AGENTS.md"));

      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      await expect(renderEffectiveHarnessModel({ model, projectDir })).rejects.toThrow(
        /output path contains a symbolic link/,
      );
      expect(existsSync(outsideFile)).toBe(false);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
      rmSync(outsideDir, { force: true, recursive: true });
    }
  });

  it("refuses to write through a symlinked output parent directory", async () => {
    const projectDir = copySampleProject();
    const outsideDir = mkdtempSync(join(tmpdir(), "architect-companion-outside-"));
    writeHarness(
      projectDir,
      `targets:
  agentsMd: false
  cursor: true
`,
    );

    try {
      symlinkSync(outsideDir, join(projectDir, ".cursor"), "dir");

      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      await expect(renderEffectiveHarnessModel({ model, projectDir })).rejects.toThrow(
        /output path contains a symbolic link/,
      );
      expect(existsSync(join(outsideDir, "rules"))).toBe(false);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
      rmSync(outsideDir, { force: true, recursive: true });
    }
  });

  it("renders the dependency-cruiser config when its target is selected", async () => {
    const projectDir = copySampleProject();
    writeHarness(
      projectDir,
      `targets:
  agentsMd: false
  cursor: false
  dependencyCruiser: true
`,
    );

    try {
      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      const results = await renderEffectiveHarnessModel({ model, projectDir });

      expect(results).toEqual([
        {
          outputPath: ".dependency-cruiser.cjs",
          status: "created",
          target: "dependencyCruiser",
        },
      ]);
      const contents = readFileSync(join(projectDir, ".dependency-cruiser.cjs"), "utf8");
      expect(contents).toContain(GENERATED_FILE_MARKER);
      expect(contents).toContain(
        "architect-companion/module-boundaries/billing-to-identity/internal-import",
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("renders the GitHub Actions workflow when its target is selected", async () => {
    const projectDir = copySampleProject();
    writeHarness(
      projectDir,
      `targets:
  agentsMd: false
  cursor: false
  githubActions: true
`,
    );

    try {
      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      const results = await renderEffectiveHarnessModel({ model, projectDir });

      expect(results).toEqual([
        {
          outputPath: ".github/workflows/architecture.yml",
          status: "created",
          target: "githubActions",
        },
      ]);
      const contents = readFileSync(join(projectDir, ".github/workflows/architecture.yml"), "utf8");
      expect(contents).toContain(GENERATED_FILE_MARKER);
      expect(contents).toContain("run: npx --no-install architect-companion render --check");
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });
});

function copySampleProject(): string {
  const projectDir = mkdtempSync(join(tmpdir(), "architect-companion-render-"));
  cpSync(sampleProjectDir, projectDir, { recursive: true });
  return projectDir;
}

function writeHarness(projectDir: string, targets: string): void {
  writeFileSync(
    join(projectDir, ".architect-companion", "harness.yml"),
    `schemaVersion: 1
profile:
  name: modular-monolith
  version: 0.1.0
project:
  name: sample-project
modules: architecture/modules.yml
${targets}`,
  );
}
