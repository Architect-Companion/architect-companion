import type { EffectiveHarnessModel } from "@architect-companion/core";

import { RendererBase, type RenderResult } from "../base/renderer.js";

type Module = EffectiveHarnessModel["modules"][number];

export class ClaudeCodeRenderer extends RendererBase {
  render(model: EffectiveHarnessModel): RenderResult {
    const files: Record<string, string> = {};

    for (const mod of model.modules) {
      files[`.claude/skills/${mod.name}/skill.md`] = this.renderSkill(mod, model);
    }

    return { files };
  }

  private renderSkill(mod: Module, model: EffectiveHarnessModel): string {
    const lines: string[] = [];

    lines.push(`# ${mod.name}`);
    lines.push("");
    lines.push(`**Path:** \`${mod.path}\``);
    lines.push(`**Public API:** \`${mod.publicApi}\``);
    lines.push("");

    const allowed = model.allowedDependencies[mod.name];
    if (allowed !== undefined && allowed.length > 0) {
      lines.push(`**Allowed to depend on:** ${allowed.map((d) => `\`${d}\``).join(", ")}`);
      lines.push("");
    }

    const forbidden = model.modules
      .filter((m) => m.name !== mod.name)
      .filter((m) => allowed === undefined || !allowed.includes(m.name));
    if (forbidden.length > 0) {
      lines.push(`**Must not import from:** ${forbidden.map((m) => `\`${m.name}\``).join(", ")}`);
      lines.push("");
    }

    if (model.principles.length > 0) {
      lines.push("## Architecture Principles");
      lines.push("");
      for (const p of model.principles) {
        lines.push(`### ${p.title}`);
        lines.push("");
        lines.push(p.guidance);
        lines.push("");
      }
    }

    if (model.policies.length > 0) {
      lines.push("## Policies");
      lines.push("");
      for (const p of model.policies) {
        lines.push(`### ${p.title} [${p.severity}]`);
        lines.push("");
        lines.push(`**Intent:** ${p.intent}`);
        lines.push("");
        lines.push(p.guidance);
        lines.push("");
      }
    }

    if (model.heuristics.length > 0) {
      lines.push("## Review Heuristics");
      lines.push("");
      for (const h of model.heuristics) {
        lines.push(`### ${h.title}`);
        lines.push("");
        for (const q of h.questions) {
          lines.push(`- ${q}`);
        }
        lines.push("");
      }
    }

    if (model.examples.length > 0) {
      lines.push("## Examples");
      lines.push("");
      for (const e of model.examples) {
        lines.push(`### ${e.title}`);
        lines.push("");
        lines.push("**Preferred:**");
        lines.push("```typescript");
        lines.push(e.good);
        lines.push("```");
        lines.push("");
        lines.push("**Avoid:**");
        lines.push("```typescript");
        lines.push(e.bad);
        lines.push("```");
        lines.push("");
      }
    }

    return lines.join("\n");
  }
}
