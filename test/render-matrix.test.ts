import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadEffectiveHarnessModel } from "../src/model/effective-model.js";
import { renderEffectiveHarnessModel } from "../src/render/render.js";
import { getTargetMetadata } from "../src/targets/target-registry.js";
import { copyComboProject, matrixGoldenPath, profilesDir, renderCombos } from "./support/combos.js";

describe("render golden matrix", () => {
  for (const combo of renderCombos) {
    it(`renders the ${combo.slug} combo to its goldens`, async () => {
      const projectDir = copyComboProject(combo.fixtureDir);

      try {
        const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
        const results = await renderEffectiveHarnessModel({ model, projectDir });

        expect(results.map((result) => result.target).sort()).toEqual(
          [...combo.enabledTargets].sort(),
        );
        expect(results.every((result) => result.status === "created")).toBe(true);

        for (const target of combo.enabledTargets) {
          for (const output of getTargetMetadata(target).outputs) {
            const content = readFileSync(join(projectDir, output.outputPath), "utf8");
            await expect(content).toMatchFileSnapshot(
              matrixGoldenPath(combo.slug, output.outputPath),
            );
          }
        }
      } finally {
        rmSync(projectDir, { force: true, recursive: true });
      }
    });
  }

  it("refuses to render dependency-cruiser when two implementations are active", async () => {
    const composition = renderCombos.find((combo) => combo.slug === "cli-mm-ts");
    if (composition === undefined) {
      throw new Error("expected a cli-mm-ts combo fixture");
    }

    const projectDir = copyComboProject(composition.fixtureDir);

    try {
      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      // The fixture keeps dependencyCruiser off; force it on to prove the current
      // single-implementation limitation fails loudly rather than silently.
      model.targets.dependencyCruiser = true;

      await expect(renderEffectiveHarnessModel({ model, projectDir })).rejects.toThrow(
        /exactly one active implementation/,
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });
});
