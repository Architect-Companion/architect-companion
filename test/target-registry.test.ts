import { describe, expect, it } from "vitest";

import { knownTargetKeys, targetRegistry } from "../src/targets/target-registry.js";

describe("target registry", () => {
  it("defines the deterministic target order used by model validation and rendering", () => {
    expect(knownTargetKeys).toEqual(targetRegistry.map((target) => target.key));
    expect(knownTargetKeys).toEqual([
      "agentsMd",
      "claudeMd",
      "cursor",
      "dependencyCruiser",
      "githubActions",
      "prAgent",
    ]);
  });
});
