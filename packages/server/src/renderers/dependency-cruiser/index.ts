import type { EffectiveHarnessModel } from "@architect-companion/core";

import { RendererBase, type RenderResult } from "../base/renderer.js";

type Rule = {
  comment: string;
  from: { path?: string; pathNot?: string };
  name: string;
  severity: string;
  to: { path?: string; pathNot?: string };
};

export class DependencyCruiserRenderer extends RendererBase {
  render(model: EffectiveHarnessModel): RenderResult {
    if (!model.targets.dependencyCruiser) {
      return { files: {} };
    }

    const severity = this.boundarySeverity(model);
    const rules: Rule[] = [];

    // For each module: forbid imports from its internals by any other module
    for (const mod of model.modules) {
      rules.push({
        name: `no-internal-${mod.name}`,
        severity,
        comment: `${mod.name}: import only through its public API (${mod.publicApi})`,
        from: { pathNot: `^${escapeRegex(mod.path)}(/|$)` },
        to: {
          path: `^${escapeRegex(mod.path)}/`,
          pathNot: `^${escapeRegex(mod.publicApi)}$`,
        },
      });
    }

    // For each module with an allowed-dependencies list: forbid deps on unlisted modules
    for (const [sourceName, allowed] of Object.entries(model.allowedDependencies)) {
      const sourceModule = model.modules.find((m) => m.name === sourceName);
      if (sourceModule === undefined) continue;

      const forbidden = model.modules.filter(
        (m) => m.name !== sourceName && !allowed.includes(m.name),
      );

      for (const target of forbidden) {
        rules.push({
          name: `${sourceName}-no-dep-${target.name}`,
          severity,
          comment: `${sourceName} is not allowed to depend on ${target.name}`,
          from: { path: `^${escapeRegex(sourceModule.path)}(/|$)` },
          to: { path: `^${escapeRegex(target.path)}(/|$)` },
        });
      }
    }

    const config = `/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: ${JSON.stringify(rules, null, 2)},
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
`;

    return { files: { ".dependency-cruiser.cjs": config } };
  }

  private boundarySeverity(model: EffectiveHarnessModel): string {
    const policy = model.policies.find(
      (p) => p.implementation?.typescript?.engine === "dependency-cruiser",
    );
    return policy?.severity ?? "error";
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
