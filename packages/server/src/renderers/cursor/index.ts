import type { EffectiveHarnessModel } from "@architect-companion/core";

import { RendererBase, type RenderResult } from "../base/renderer.js";

type Module = EffectiveHarnessModel["modules"][number];

export class CursorRenderer extends RendererBase {
  render(model: EffectiveHarnessModel): RenderResult {
    if (!model.targets.cursor) {
      return { files: {} };
    }

    const files: Record<string, string> = {};

    for (const mod of model.modules) {
      files[`.cursor/rules/${mod.name}.mdc`] = this.renderModuleRule(mod, model);
    }

    return { files };
  }

  private renderModuleRule(mod: Module, model: EffectiveHarnessModel): string {
    const lines: string[] = [];

    lines.push("---");
    lines.push(`description: Architecture rules for the ${mod.name} module`);
    lines.push(`globs: ["${mod.path}/**"]`);
    lines.push("alwaysApply: false");
    lines.push("---");
    lines.push("");
    lines.push(`# Module: ${mod.name}`);
    lines.push("");
    lines.push(`**Path:** \`${mod.path}\``);
    lines.push(`**Public API:** \`${mod.publicApi}\``);
    lines.push("");

    const allowed = model.allowedDependencies[mod.name];
    if (allowed !== undefined && allowed.length > 0) {
      lines.push(`**Allowed dependencies:** ${allowed.map((d) => `\`${d}\``).join(", ")}`);
      lines.push("");
    }

    if (model.policies.length > 0) {
      lines.push("## Policies");
      lines.push("");
      for (const p of model.policies) {
        lines.push(`- **${p.title}** [${p.severity}]: ${p.intent}`);
      }
      lines.push("");
    }

    if (model.principles.length > 0) {
      lines.push("## Principles");
      lines.push("");
      for (const p of model.principles) {
        lines.push(`### ${p.title}`);
        lines.push("");
        lines.push(p.guidance);
        lines.push("");
      }
    }

    return lines.join("\n");
  }
}
