import type { EffectiveHarnessModel } from "@architect-companion/core";

import { RendererBase, type RenderResult } from "../base/renderer.js";

export class AgentsMdRenderer extends RendererBase {
  render(model: EffectiveHarnessModel): RenderResult {
    if (!model.targets.agentsMd) {
      return { files: {} };
    }

    const lines: string[] = [];

    lines.push(`# AGENTS.md — ${model.project.name}`);
    lines.push("");

    if (model.profile.title !== undefined) {
      lines.push(`> **Profile:** ${model.profile.title} (\`${model.profile.name}@${model.profile.version}\`)`);
    } else {
      lines.push(`> **Profile:** \`${model.profile.name}@${model.profile.version}\``);
    }

    if (model.profile.summary !== undefined) {
      lines.push(`> ${model.profile.summary}`);
    }
    lines.push("");

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

    if (model.policies.length > 0) {
      lines.push("## Policies");
      lines.push("");
      for (const p of model.policies) {
        lines.push(`### ${p.title} \`[${p.severity}]\``);
        lines.push("");
        lines.push(`**Intent:** ${p.intent}`);
        lines.push("");
        lines.push(p.guidance);
        lines.push("");
      }
    }

    if (model.workflows.length > 0) {
      lines.push("## Workflows");
      lines.push("");
      for (const w of model.workflows) {
        lines.push(`### ${w.title}`);
        lines.push("");
        w.steps.forEach((step, i) => {
          lines.push(`${i + 1}. ${step}`);
        });
        lines.push("");
      }
    }

    if (model.heuristics.length > 0) {
      lines.push("## Heuristics");
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

    if (model.modules.length > 0) {
      lines.push("## Module Structure");
      lines.push("");
      for (const m of model.modules) {
        lines.push(`- **${m.name}** (\`${m.path}\`) — public API: \`${m.publicApi}\``);
      }
      lines.push("");
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

    return { files: { "AGENTS.md": lines.join("\n") } };
  }
}
