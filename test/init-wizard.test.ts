import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts", () => {
  const cancelSymbol = Symbol.for("clack:cancel");
  return {
    cancel: vi.fn(),
    confirm: vi.fn(),
    intro: vi.fn(),
    isCancel: (value: unknown) => value === cancelSymbol,
    multiselect: vi.fn(),
    note: vi.fn(),
    outro: vi.fn(),
    text: vi.fn(),
  };
});

const cancelSymbol = Symbol.for("clack:cancel");

const profilesDir = fileURLToPath(new URL("../profiles", import.meta.url));

const clack = await import("@clack/prompts");
const { runInitWizard } = await import("../src/init/prompts.js");
const { loadProfileMetadata } = await import("../src/model/effective-model.js");

function mockedFn<T extends keyof typeof clack>(name: T) {
  return clack[name] as unknown as ReturnType<typeof vi.fn>;
}

describe("runInitWizard", () => {
  beforeEach(() => {
    mockedFn("text").mockReset();
    mockedFn("multiselect").mockReset();
    mockedFn("confirm").mockReset();
    mockedFn("intro").mockReset();
    mockedFn("outro").mockReset();
    mockedFn("note").mockReset();
    mockedFn("cancel").mockReset();
  });

  it("collects all values when no presets are given and auto-picks a single profile", async () => {
    mockedFn("text").mockResolvedValueOnce("widgets").mockResolvedValueOnce("typescript");
    mockedFn("multiselect").mockResolvedValueOnce(["agentsMd", "cursor"]);
    mockedFn("confirm").mockResolvedValueOnce(true);

    const result = await runInitWizard({
      defaultProjectName: "widgets",
      installedProfiles: ["cli"],
      loadProfile: async (name) => loadProfileMetadata(profilesDir, name),
      presetTargetsExplicit: false,
    });

    expect(result.cancelled).toBe(false);
    if (result.cancelled) return;
    expect(result.projectName).toBe("widgets");
    expect(result.profileNames).toEqual(["cli"]);
    expect(result.languages).toEqual(["typescript"]);
    expect(result.enabledTargets).toEqual(["cursor"]);
    expect(result.disabledTargets).toEqual([]);
  });

  it("skips the project-name prompt when --project-name was passed", async () => {
    mockedFn("text").mockResolvedValueOnce("typescript");
    mockedFn("multiselect").mockResolvedValueOnce(["agentsMd"]);
    mockedFn("confirm").mockResolvedValueOnce(true);

    const result = await runInitWizard({
      defaultProjectName: "fallback",
      installedProfiles: ["cli"],
      loadProfile: async (name) => loadProfileMetadata(profilesDir, name),
      presetProjectName: "preset-name",
      presetTargetsExplicit: false,
    });

    expect(mockedFn("text")).toHaveBeenCalledTimes(1);
    if (!result.cancelled) {
      expect(result.projectName).toBe("preset-name");
    }
  });

  it("returns cancelled when the user aborts a prompt", async () => {
    mockedFn("text").mockResolvedValueOnce(cancelSymbol);

    const result = await runInitWizard({
      defaultProjectName: "widgets",
      installedProfiles: ["cli"],
      loadProfile: async (name) => loadProfileMetadata(profilesDir, name),
      presetTargetsExplicit: false,
    });

    expect(result.cancelled).toBe(true);
  });

  it("returns cancelled when the confirmation prompt is declined", async () => {
    mockedFn("text").mockResolvedValueOnce("widgets").mockResolvedValueOnce("typescript");
    mockedFn("multiselect").mockResolvedValueOnce(["agentsMd"]);
    mockedFn("confirm").mockResolvedValueOnce(false);

    const result = await runInitWizard({
      defaultProjectName: "widgets",
      installedProfiles: ["cli"],
      loadProfile: async (name) => loadProfileMetadata(profilesDir, name),
      presetTargetsExplicit: false,
    });

    expect(result.cancelled).toBe(true);
  });

  it("does not run the targets prompt when targets are preset via flags", async () => {
    mockedFn("text").mockResolvedValueOnce("widgets").mockResolvedValueOnce("typescript");
    mockedFn("confirm").mockResolvedValueOnce(true);

    const result = await runInitWizard({
      defaultProjectName: "widgets",
      installedProfiles: ["cli"],
      loadProfile: async (name) => loadProfileMetadata(profilesDir, name),
      presetTargetsExplicit: true,
    });

    expect(mockedFn("multiselect")).not.toHaveBeenCalled();
    if (!result.cancelled) {
      expect(result.enabledTargets).toEqual([]);
      expect(result.disabledTargets).toEqual([]);
    }
  });

  it("computes disabled targets when the user removes an init default", async () => {
    mockedFn("text").mockResolvedValueOnce("widgets").mockResolvedValueOnce("typescript");
    mockedFn("multiselect").mockResolvedValueOnce(["cursor"]);
    mockedFn("confirm").mockResolvedValueOnce(true);

    const result = await runInitWizard({
      defaultProjectName: "widgets",
      installedProfiles: ["cli"],
      loadProfile: async (name) => loadProfileMetadata(profilesDir, name),
      presetTargetsExplicit: false,
    });

    if (result.cancelled) {
      throw new Error("Expected result to not be cancelled");
    }
    expect(result.enabledTargets).toEqual(["cursor"]);
    expect(result.disabledTargets).toEqual(["agentsMd"]);
  });

  it("prompts via multiselect when multiple profiles are installed", async () => {
    mockedFn("text").mockResolvedValueOnce("widgets").mockResolvedValueOnce("typescript");
    mockedFn("multiselect")
      .mockResolvedValueOnce(["cli", "typescript"])
      .mockResolvedValueOnce(["agentsMd"]);
    mockedFn("confirm").mockResolvedValueOnce(true);

    const result = await runInitWizard({
      defaultProjectName: "widgets",
      installedProfiles: ["cli", "typescript"],
      loadProfile: async (name) => loadProfileMetadata(profilesDir, name),
      presetTargetsExplicit: false,
    });

    expect(mockedFn("multiselect")).toHaveBeenCalledTimes(2);
    if (!result.cancelled) {
      expect(result.profileNames).toEqual(["cli", "typescript"]);
    }
  });

  it("throws InitError when a --profile preset is not installed", async () => {
    mockedFn("text").mockResolvedValueOnce("widgets");

    await expect(
      runInitWizard({
        defaultProjectName: "widgets",
        installedProfiles: ["cli"],
        loadProfile: async (name) => loadProfileMetadata(profilesDir, name),
        presetProfileNames: ["bogus"],
        presetTargetsExplicit: false,
      }),
    ).rejects.toThrow(/--profile bogus is not installed/);
  });

  it("throws InitError when no profiles are installed", async () => {
    mockedFn("text").mockResolvedValueOnce("widgets");

    await expect(
      runInitWizard({
        defaultProjectName: "widgets",
        installedProfiles: [],
        loadProfile: async (name) => loadProfileMetadata(profilesDir, name),
        presetTargetsExplicit: false,
      }),
    ).rejects.toThrow(/No profiles installed/);
  });

  it("returns cancelled when the confirm prompt is aborted via isCancel", async () => {
    mockedFn("text").mockResolvedValueOnce("widgets").mockResolvedValueOnce("typescript");
    mockedFn("multiselect").mockResolvedValueOnce(["agentsMd"]);
    mockedFn("confirm").mockResolvedValueOnce(cancelSymbol);

    const result = await runInitWizard({
      defaultProjectName: "widgets",
      installedProfiles: ["cli"],
      loadProfile: async (name) => loadProfileMetadata(profilesDir, name),
      presetTargetsExplicit: false,
    });

    expect(result.cancelled).toBe(true);
  });

  it("uses preset languages without prompting", async () => {
    mockedFn("text").mockResolvedValueOnce("widgets");
    mockedFn("multiselect").mockResolvedValueOnce(["agentsMd"]);
    mockedFn("confirm").mockResolvedValueOnce(true);

    const result = await runInitWizard({
      defaultProjectName: "widgets",
      installedProfiles: ["cli"],
      loadProfile: async (name) => loadProfileMetadata(profilesDir, name),
      presetLanguages: ["typescript"],
      presetTargetsExplicit: false,
    });

    expect(mockedFn("text")).toHaveBeenCalledTimes(1);
    if (!result.cancelled) {
      expect(result.languages).toEqual(["typescript"]);
    }
  });
});
