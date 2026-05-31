import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { computeCapabilityWarnings } from "../src/diagnostics/capability-warnings.js";
import { loadEffectiveHarnessModel } from "../src/model/effective-model.js";

const profilesDir = fileURLToPath(new URL("../profiles", import.meta.url));
const sampleProjectDir = fileURLToPath(new URL("fixtures/sample-project", import.meta.url));

describe("computeCapabilityWarnings", () => {
  it("warns when an enforceable policy has no engine target selected", async () => {
    const model = await loadEffectiveHarnessModel({
      profilesDir,
      projectDir: sampleProjectDir,
    });

    const warnings = computeCapabilityWarnings(model);

    expect(warnings.map((warning) => warning.code)).toContain(
      "dependency-cruiser-policy-without-target",
    );
  });

  it("warns when GitHub Actions is selected without any external engine", async () => {
    const model = await loadEffectiveHarnessModel({
      profilesDir,
      projectDir: sampleProjectDir,
    });

    const warnings = computeCapabilityWarnings({
      ...model,
      targets: { ...model.targets, githubActions: true, dependencyCruiser: false },
    });

    expect(warnings.map((warning) => warning.code)).toContain(
      "github-actions-without-architecture-checks",
    );
  });

  it("warns when dependency-cruiser target is selected without any matching policy", async () => {
    const model = await loadEffectiveHarnessModel({
      profilesDir,
      projectDir: sampleProjectDir,
    });

    const warnings = computeCapabilityWarnings({
      ...model,
      policies: [],
      targets: { ...model.targets, dependencyCruiser: true },
    });

    expect(warnings.map((warning) => warning.code)).toContain(
      "dependency-cruiser-target-without-policy",
    );
  });

  it("emits no warnings when targets and policies line up", async () => {
    const model = await loadEffectiveHarnessModel({
      profilesDir,
      projectDir: sampleProjectDir,
    });

    const warnings = computeCapabilityWarnings({
      ...model,
      targets: {
        ...model.targets,
        agentsMd: true,
        dependencyCruiser: true,
        githubActions: true,
      },
    });

    expect(warnings).toEqual([]);
  });
});
