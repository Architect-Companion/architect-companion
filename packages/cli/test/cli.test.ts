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
  const options = {
    profilesDir: "/profiles",
    version: "1.2.3",
  };

  it("prints help when called without arguments", async () => {
    const { io, writes } = createIo();

    const exitCode = await runCli([], io, options);

    expect(exitCode).toBe(0);
    expect(writes.stdout).toBe(HELP_TEXT);
    expect(writes.stderr).toBe("");
  });

  it("prints help for help flags", async () => {
    for (const flag of ["-h", "--help"]) {
      const { io, writes } = createIo();

      const exitCode = await runCli([flag], io, options);

      expect(exitCode).toBe(0);
      expect(writes.stdout).toBe(HELP_TEXT);
      expect(writes.stderr).toBe("");
    }
  });

  it("prints the package version for version flags", async () => {
    for (const flag of ["-v", "--version"]) {
      const { io, writes } = createIo();

      const exitCode = await runCli([flag], io, options);

      expect(exitCode).toBe(0);
      expect(writes.stdout).toBe("1.2.3\n");
      expect(writes.stderr).toBe("");
    }
  });

  it("fails for unknown arguments", async () => {
    const { io, writes } = createIo();

    const exitCode = await runCli(["render"], io, options);

    expect(exitCode).toBe(1);
    expect(writes.stdout).toBe("");
    expect(writes.stderr).toBe(
      "Unknown argument: render\nRun `architect-companion --help` for usage.\n",
    );
  });

  it("prints the effective model for a valid project", async () => {
    const { io, writes } = createIo();
    const projectDir = fileURLToPath(
      new URL("../../core/test/fixtures/sample-project", import.meta.url),
    );
    const profilesDir = fileURLToPath(new URL("../../core/profiles", import.meta.url));

    const exitCode = await runCli(
      ["inspect", "effective-model", "--project", projectDir, "--profiles", profilesDir],
      io,
      options,
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(writes.stdout)).toMatchObject({
      profile: {
        name: "modular-monolith",
        version: "0.1.0",
      },
      project: {
        name: "sample-project",
      },
      stack: "typescript",
    });
    expect(writes.stderr).toBe("");
  });

  it("fails inspect with useful validation errors", async () => {
    const { io, writes } = createIo();
    const projectDir = mkdtempSync(join(tmpdir(), "architect-companion-empty-"));
    const profilesDir = fileURLToPath(new URL("../../core/profiles", import.meta.url));

    try {
      const exitCode = await runCli(
        ["inspect", "effective-model", "--project", projectDir, "--profiles", profilesDir],
        io,
        options,
      );

      expect(exitCode).toBe(1);
      expect(writes.stdout).toBe("");
      expect(writes.stderr).toContain("harness.yml: file not found.");
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("rejects missing inspect option values before loading files", async () => {
    const { io, writes } = createIo();

    const exitCode = await runCli(
      ["inspect", "effective-model", "--project", "--profiles", "profiles"],
      io,
      options,
    );

    expect(exitCode).toBe(1);
    expect(writes.stdout).toBe("");
    expect(writes.stderr).toBe(
      "--project requires a directory.\nRun `architect-companion --help` for usage.\n",
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
