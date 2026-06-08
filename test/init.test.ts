import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { runCli } from "../src/cli.js";

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

const profilesDir = fileURLToPath(new URL("../profiles", import.meta.url));
const goldenInitDir = fileURLToPath(new URL("fixtures/golden/init", import.meta.url));

const cliOptions = {
  profilesDir,
  version: "1.2.3",
};

function makeTempProject(): string {
  return mkdtempSync(join(tmpdir(), "architect-companion-init-"));
}

describe("architect-companion init", () => {
  it("scaffolds and renders defaults on a clean project", async () => {
    const projectDir = makeTempProject();

    try {
      const { io, writes } = createIo();
      const exitCode = await runCli(
        ["init", "--project", projectDir, "--profiles", profilesDir],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(0);
      expect(writes.stderr).toBe("");
      expect(writes.stdout).toContain("Profile: modular-monolith@0.1.0");
      expect(writes.stdout).toContain("Stack: typescript");
      expect(writes.stdout).toContain("created .architect-companion/harness.yml");
      expect(writes.stdout).toContain("created .architect-companion/architecture/modules.yml");
      expect(writes.stdout).toContain("created .architect-companion/profile.lock.yml");
      expect(writes.stdout).toContain("created AGENTS.md");
      expect(writes.stdout).toContain("Next: declare your modules");

      expect(existsSync(join(projectDir, ".architect-companion/harness.yml"))).toBe(true);
      expect(existsSync(join(projectDir, ".architect-companion/architecture/modules.yml"))).toBe(
        true,
      );
      expect(existsSync(join(projectDir, ".architect-companion/profile.lock.yml"))).toBe(true);
      expect(existsSync(join(projectDir, "AGENTS.md"))).toBe(true);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("produces the golden harness.yml and modules.yml for the default flag-driven init", async () => {
    const projectDir = makeTempProject();

    try {
      const { io } = createIo();
      const exitCode = await runCli(
        [
          "init",
          "--project",
          projectDir,
          "--profiles",
          profilesDir,
          "--project-name",
          "widgets",
          "--no-render",
        ],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(0);
      expect(readFileSync(join(projectDir, ".architect-companion/harness.yml"), "utf8")).toBe(
        readFileSync(join(goldenInitDir, "harness.yml"), "utf8"),
      );
      expect(
        readFileSync(join(projectDir, ".architect-companion/architecture/modules.yml"), "utf8"),
      ).toBe(readFileSync(join(goldenInitDir, "modules.yml"), "utf8"));
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("refuses when .architect-companion/ already exists", async () => {
    const projectDir = makeTempProject();
    mkdirSync(join(projectDir, ".architect-companion"));

    try {
      const { io, writes } = createIo();
      const exitCode = await runCli(
        ["init", "--project", projectDir, "--profiles", profilesDir],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(1);
      expect(writes.stdout).toBe("");
      expect(writes.stderr).toContain(".architect-companion/ already exists");
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("refuses and leaves no artifacts when an unmarked render target already exists", async () => {
    const projectDir = makeTempProject();
    writeFileSync(join(projectDir, "AGENTS.md"), "# hand-written AGENTS.md\n");

    try {
      const { io, writes } = createIo();
      const exitCode = await runCli(
        ["init", "--project", projectDir, "--profiles", profilesDir],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(1);
      expect(writes.stderr).toContain("AGENTS.md");
      expect(writes.stderr).toContain("not managed by Architect Companion");
      expect(existsSync(join(projectDir, ".architect-companion"))).toBe(false);
      expect(readFileSync(join(projectDir, "AGENTS.md"), "utf8")).toBe(
        "# hand-written AGENTS.md\n",
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("--dry-run writes nothing and reports the plan", async () => {
    const projectDir = makeTempProject();

    try {
      const { io, writes } = createIo();
      const exitCode = await runCli(
        [
          "init",
          "--project",
          projectDir,
          "--profiles",
          profilesDir,
          "--target",
          "cursor",
          "--dry-run",
        ],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(0);
      expect(writes.stdout).toContain("Pre-flight: OK");
      expect(writes.stdout).toContain("Would create .architect-companion/harness.yml");
      expect(writes.stdout).toContain("Would create .architect-companion/architecture/modules.yml");
      expect(writes.stdout).toContain("Would run render, producing:");
      expect(writes.stdout).toContain("AGENTS.md");
      expect(writes.stdout).toContain(".cursor/rules/architect-companion.mdc");
      expect(writes.stdout).toContain("No files written (dry-run).");
      expect(existsSync(join(projectDir, ".architect-companion"))).toBe(false);
      expect(existsSync(join(projectDir, "AGENTS.md"))).toBe(false);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("--no-render scaffolds without rendering", async () => {
    const projectDir = makeTempProject();

    try {
      const { io, writes } = createIo();
      const exitCode = await runCli(
        ["init", "--project", projectDir, "--profiles", profilesDir, "--no-render"],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(0);
      expect(writes.stdout).toContain("Skipped rendering (--no-render)");
      expect(existsSync(join(projectDir, ".architect-companion/harness.yml"))).toBe(true);
      expect(existsSync(join(projectDir, ".architect-companion/profile.lock.yml"))).toBe(true);
      expect(existsSync(join(projectDir, "AGENTS.md"))).toBe(false);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("--target cursor adds the cursor output", async () => {
    const projectDir = makeTempProject();

    try {
      const { io, writes } = createIo();
      const exitCode = await runCli(
        ["init", "--project", projectDir, "--profiles", profilesDir, "--target", "cursor"],
        io,
        cliOptions,
      );

      expect(writes.stderr).toBe("");
      expect(exitCode).toBe(0);
      expect(existsSync(join(projectDir, ".cursor/rules/architect-companion.mdc"))).toBe(true);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("--no-target agentsMd disables the profile default", async () => {
    const projectDir = makeTempProject();

    try {
      const { io } = createIo();
      const exitCode = await runCli(
        ["init", "--project", projectDir, "--profiles", profilesDir, "--no-target", "agentsMd"],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(0);
      expect(existsSync(join(projectDir, "AGENTS.md"))).toBe(false);
      expect(readFileSync(join(projectDir, ".architect-companion/harness.yml"), "utf8")).toContain(
        "agentsMd: false",
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("rejects --target with an unknown key", async () => {
    const projectDir = makeTempProject();

    try {
      const { io, writes } = createIo();
      const exitCode = await runCli(
        ["init", "--project", projectDir, "--profiles", profilesDir, "--target", "claudeCode"],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(1);
      expect(writes.stderr).toContain("--target must be one of");
      expect(writes.stderr).toContain("agentsMd");
      expect(existsSync(join(projectDir, ".architect-companion"))).toBe(false);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("rejects --stack with an unsupported value", async () => {
    const projectDir = makeTempProject();

    try {
      const { io, writes } = createIo();
      const exitCode = await runCli(
        ["init", "--project", projectDir, "--profiles", profilesDir, "--stack", "java"],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(1);
      expect(writes.stderr).toContain("--stack must be one of");
      expect(existsSync(join(projectDir, ".architect-companion"))).toBe(false);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("rejects when --target and --no-target name the same key", async () => {
    const projectDir = makeTempProject();

    try {
      const { io, writes } = createIo();
      const exitCode = await runCli(
        [
          "init",
          "--project",
          projectDir,
          "--profiles",
          profilesDir,
          "--target",
          "cursor",
          "--no-target",
          "cursor",
        ],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(1);
      expect(writes.stderr).toContain("cannot be both enabled");
      expect(existsSync(join(projectDir, ".architect-companion"))).toBe(false);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("rejects --profile referring to a profile that is not installed", async () => {
    const projectDir = makeTempProject();

    try {
      const { io, writes } = createIo();
      const exitCode = await runCli(
        [
          "init",
          "--project",
          projectDir,
          "--profiles",
          profilesDir,
          "--profile",
          "service-oriented",
        ],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(1);
      expect(writes.stderr).toContain("service-oriented");
      expect(existsSync(join(projectDir, ".architect-companion"))).toBe(false);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("uses --project-name to override the directory-based default", async () => {
    const projectDir = makeTempProject();

    try {
      const { io } = createIo();
      const exitCode = await runCli(
        [
          "init",
          "--project",
          projectDir,
          "--profiles",
          profilesDir,
          "--project-name",
          "custom-name",
          "--no-render",
        ],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(0);
      expect(readFileSync(join(projectDir, ".architect-companion/harness.yml"), "utf8")).toContain(
        "name: custom-name",
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("reports an error when no profiles are installed", async () => {
    const projectDir = makeTempProject();
    const emptyProfilesDir = mkdtempSync(join(tmpdir(), "architect-companion-empty-profiles-"));

    try {
      const { io, writes } = createIo();
      const exitCode = await runCli(
        ["init", "--project", projectDir, "--profiles", emptyProfilesDir],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(1);
      expect(writes.stderr).toContain("No profiles installed");
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
      rmSync(emptyProfilesDir, { force: true, recursive: true });
    }
  });

  it("rolls back the scaffold when render fails after pre-flight passes", async () => {
    const projectDir = makeTempProject();

    const renderModule = await import("../src/render/render.js");
    const renderSpy = vi
      .spyOn(renderModule, "renderEffectiveHarnessModel")
      .mockRejectedValueOnce(new renderModule.RenderError("simulated render failure"));

    try {
      const { io, writes } = createIo();
      const exitCode = await runCli(
        ["init", "--project", projectDir, "--profiles", profilesDir],
        io,
        cliOptions,
      );

      expect(exitCode).toBe(1);
      expect(writes.stderr).toContain("simulated render failure");
      expect(existsSync(join(projectDir, ".architect-companion"))).toBe(false);
      expect(existsSync(join(projectDir, "AGENTS.md"))).toBe(false);
    } finally {
      renderSpy.mockRestore();
      rmSync(projectDir, { force: true, recursive: true });
    }
  });
});
