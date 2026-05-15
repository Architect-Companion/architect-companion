import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { HELP_TEXT, isDirectRun, runCli } from "../src/cli.js";

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

describe("runCli", () => {
  it("prints help when called without arguments", () => {
    const { io, writes } = createIo();

    const exitCode = runCli([], io, { version: "1.2.3" });

    expect(exitCode).toBe(0);
    expect(writes.stdout).toBe(HELP_TEXT);
    expect(writes.stderr).toBe("");
  });

  it("prints help for help flags", () => {
    for (const flag of ["-h", "--help"]) {
      const { io, writes } = createIo();

      const exitCode = runCli([flag], io, { version: "1.2.3" });

      expect(exitCode).toBe(0);
      expect(writes.stdout).toBe(HELP_TEXT);
      expect(writes.stderr).toBe("");
    }
  });

  it("prints the package version for version flags", () => {
    for (const flag of ["-v", "--version"]) {
      const { io, writes } = createIo();

      const exitCode = runCli([flag], io, { version: "1.2.3" });

      expect(exitCode).toBe(0);
      expect(writes.stdout).toBe("1.2.3\n");
      expect(writes.stderr).toBe("");
    }
  });

  it("fails for unknown arguments", () => {
    const { io, writes } = createIo();

    const exitCode = runCli(["render"], io, { version: "1.2.3" });

    expect(exitCode).toBe(1);
    expect(writes.stdout).toBe("");
    expect(writes.stderr).toBe(
      "Unknown argument: render\nRun `architect-companion --help` for usage.\n",
    );
  });

  it("detects direct execution through a package manager symlink", () => {
    const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
    const tempDir = mkdtempSync(join(tmpdir(), "architect-companion-"));
    const binPath = join(tempDir, "architect-companion");

    try {
      symlinkSync(cliPath, binPath);

      expect(isDirectRun(pathToFileURL(cliPath).href, binPath)).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
