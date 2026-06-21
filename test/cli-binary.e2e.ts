import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const profilesDir = fileURLToPath(new URL("../profiles", import.meta.url));
const cliTsFixture = fileURLToPath(new URL("fixtures/projects/cli-ts", import.meta.url));
const cliTsGoldenDir = fileURLToPath(new URL("fixtures/golden/matrix/cli-ts", import.meta.url));

const cliTsOutputs = [
  "AGENTS.md",
  "CLAUDE.md",
  ".cursor/rules/architect-companion.mdc",
  ".dependency-cruiser.cjs",
  ".github/workflows/architecture.yml",
];

function runBinary(args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

describe("architect-companion built binary", () => {
  beforeAll(() => {
    if (!existsSync(cliPath)) {
      throw new Error(
        `dist/cli.js not found at ${cliPath}. Run \`npm run build\` (or \`npm run test:e2e\`) first.`,
      );
    }
  });

  it("reports its version", () => {
    const result = runBinary(["--version"]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("renders the cli-ts combo byte-for-byte identically to the in-process goldens", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "architect-companion-e2e-"));
    cpSync(cliTsFixture, projectDir, { recursive: true });

    try {
      const result = runBinary(["render", "--project", projectDir, "--profiles", profilesDir]);
      expect(result.status, result.stderr).toBe(0);

      for (const relativePath of cliTsOutputs) {
        const produced = readFileSync(join(projectDir, relativePath), "utf8");
        const golden = readFileSync(join(cliTsGoldenDir, relativePath), "utf8");
        expect(produced, `${relativePath} from the binary does not match its golden`).toBe(golden);
      }
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("exits non-zero with a useful message when the harness is missing", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "architect-companion-e2e-empty-"));

    try {
      const result = runBinary([
        "inspect",
        "effective-model",
        "--project",
        emptyDir,
        "--profiles",
        profilesDir,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("harness.yml: file not found.");
    } finally {
      rmSync(emptyDir, { force: true, recursive: true });
    }
  });
});
