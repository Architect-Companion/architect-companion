import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { getArchitectureCheckCommands } from "../src/checks/architecture-check-commands.js";
import { loadEffectiveHarnessModel } from "../src/model/effective-model.js";

const profilesDir = fileURLToPath(new URL("../profiles", import.meta.url));
const sampleProjectDir = fileURLToPath(new URL("fixtures/sample-project", import.meta.url));

describe("getArchitectureCheckCommands", () => {
  it("returns selected architecture check commands", async () => {
    const model = await loadEffectiveHarnessModel({
      profilesDir,
      projectDir: sampleProjectDir,
    });

    expect(getArchitectureCheckCommands(withDependencyCruiserEnabled(model))).toEqual([
      {
        id: "dependency-cruiser",
        name: "Run dependency-cruiser architecture checks",
        run: "npx --no-install depcruise --config .dependency-cruiser.cjs src/modules/billing src/modules/identity",
      },
    ]);
  });

  it("omits commands when no policy selects an external engine", async () => {
    const model = await loadEffectiveHarnessModel({
      profilesDir,
      projectDir: sampleProjectDir,
    });

    expect(getArchitectureCheckCommands({ ...model, policies: [] })).toEqual([]);
  });

  it("omits commands when the target for the selected engine is disabled", async () => {
    const model = await loadEffectiveHarnessModel({
      profilesDir,
      projectDir: sampleProjectDir,
    });

    expect(
      getArchitectureCheckCommands({
        ...model,
        targets: {
          ...model.targets,
          dependencyCruiser: false,
        },
      }),
    ).toEqual([]);
  });

  it("quotes command arguments that are not shell-safe words", async () => {
    const model = await loadEffectiveHarnessModel({
      profilesDir,
      projectDir: sampleProjectDir,
    });

    expect(
      getArchitectureCheckCommands(
        withDependencyCruiserEnabled({
          ...model,
          boundaries: model.boundaries.map((boundary) =>
            boundary.name === "billing"
              ? {
                  ...boundary,
                  path: "src/modules/billing core",
                  publicApi: "src/modules/billing core/index.ts",
                }
              : boundary,
          ),
        }),
      )[0]?.run,
    ).toBe(
      "npx --no-install depcruise --config .dependency-cruiser.cjs 'src/modules/billing core' src/modules/identity",
    );
  });
});

function withDependencyCruiserEnabled(
  model: Awaited<ReturnType<typeof loadEffectiveHarnessModel>>,
): Awaited<ReturnType<typeof loadEffectiveHarnessModel>> {
  return {
    ...model,
    targets: {
      ...model.targets,
      dependencyCruiser: true,
    },
  };
}
