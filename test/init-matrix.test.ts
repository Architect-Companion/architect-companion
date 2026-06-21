import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";
import { initGoldenPath, profilesDir, renderCombos } from "./support/combos.js";

const cliOptions = {
  profilesDir,
  version: "1.2.3",
};

function createIo() {
  const writes = {
    stderr: "",
    stdout: "",
  };

  return {
    io: {
      stderr: {
        write(chunk: string) {
          writes.stderr += chunk;
        },
      },
      stdout: {
        write(chunk: string) {
          writes.stdout += chunk;
        },
      },
    },
    writes,
  };
}

describe("init scaffolding goldens", () => {
  for (const combo of renderCombos) {
    it(`scaffolds harness and boundaries for ${combo.slug}`, async () => {
      const projectDir = mkdtempSync(join(tmpdir(), "architect-companion-init-matrix-"));

      try {
        const { io, writes } = createIo();
        const exitCode = await runCli(
          [
            "init",
            "--project",
            projectDir,
            "--profiles",
            profilesDir,
            "--project-name",
            combo.projectName,
            "--no-render",
            ...combo.profiles.flatMap((profile) => ["--profile", profile]),
            "--language",
            "typescript",
          ],
          io,
          cliOptions,
        );

        expect(exitCode, writes.stderr).toBe(0);
        await expect(
          readFileSync(join(projectDir, ".architect-companion/harness.yml"), "utf8"),
        ).toMatchFileSnapshot(initGoldenPath(combo.slug, "harness.yml"));
        await expect(
          readFileSync(
            join(projectDir, ".architect-companion/architecture/boundaries.yml"),
            "utf8",
          ),
        ).toMatchFileSnapshot(initGoldenPath(combo.slug, "boundaries.yml"));
      } finally {
        rmSync(projectDir, { force: true, recursive: true });
      }
    });
  }
});
