import type { EffectiveHarnessModel } from "../model/effective-model.js";

export function renderMarkdownGuidanceBody(model: EffectiveHarnessModel): string {
  const lines: string[] = [
    `Project: ${model.project.name}`,
    "Profiles:",
    ...model.profiles.map(
      (profile) => `- ${profile.title ?? profile.name} (${profile.name} ${profile.version})`,
    ),
    "",
    `Languages: ${model.project.languages.join(", ")}`,
    "",
  ];

  appendPrinciples(lines, model);
  appendPolicies(lines, model);
  appendModules(lines, model);
  appendWorkflows(lines, model);
  appendHeuristics(lines, model);
  appendExamples(lines, model);

  return lines.join("\n");
}

function appendPrinciples(lines: string[], model: EffectiveHarnessModel): void {
  if (model.principles.length === 0) {
    return;
  }

  lines.push("## Principles");
  lines.push("");
  for (const principle of model.principles) {
    lines.push(`- ${principle.title} (${principle.sourceProfile}): ${principle.guidance}`);
  }
  lines.push("");
}

function appendPolicies(lines: string[], model: EffectiveHarnessModel): void {
  if (model.policies.length === 0) {
    return;
  }

  lines.push("## Policies");
  lines.push("");
  for (const policy of model.policies) {
    lines.push(`### ${policy.title}`);
    lines.push("");
    lines.push(`Source: ${policy.sourceProfile}`);
    lines.push("");
    lines.push(`Severity: ${policy.severity}`);
    lines.push("");
    lines.push(`Intent: ${policy.intent}`);
    lines.push("");
    lines.push(policy.guidance);
    lines.push("");
  }
}

function appendModules(lines: string[], model: EffectiveHarnessModel): void {
  if (model.boundaries.length === 0) {
    return;
  }

  lines.push("## Boundaries");
  lines.push("");
  for (const boundary of model.boundaries) {
    lines.push(`- ${boundary.name}: ${boundary.path}`);
    lines.push(`  Public API: ${boundary.publicApi}`);
    lines.push(
      `  Allowed dependencies: ${(model.allowedDependencies[boundary.name] ?? []).join(", ") || "none"}`,
    );
  }
  lines.push("");
}

function appendWorkflows(lines: string[], model: EffectiveHarnessModel): void {
  if (model.workflows.length === 0) {
    return;
  }

  lines.push("## Workflows");
  lines.push("");
  for (const workflow of model.workflows) {
    lines.push(`### ${workflow.title}`);
    lines.push("");
    lines.push(`Source: ${workflow.sourceProfile}`);
    lines.push("");
    workflow.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
    lines.push("");
  }
}

function appendHeuristics(lines: string[], model: EffectiveHarnessModel): void {
  if (model.heuristics.length === 0) {
    return;
  }

  lines.push("## Review Heuristics");
  lines.push("");
  for (const heuristic of model.heuristics) {
    lines.push(`### ${heuristic.title}`);
    lines.push("");
    lines.push(`Source: ${heuristic.sourceProfile}`);
    lines.push("");
    for (const question of heuristic.questions) {
      lines.push(`- ${question}`);
    }
    lines.push("");
  }
}

function appendExamples(lines: string[], model: EffectiveHarnessModel): void {
  if (model.examples.length === 0) {
    return;
  }

  lines.push("## Examples");
  lines.push("");
  for (const example of model.examples) {
    lines.push(`### ${example.title}`);
    lines.push("");
    lines.push(`Source: ${example.sourceProfile}`);
    lines.push("");
    lines.push("Good:");
    lines.push("");
    lines.push("```ts");
    lines.push(example.good);
    lines.push("```");
    lines.push("");
    lines.push("Bad:");
    lines.push("");
    lines.push("```ts");
    lines.push(example.bad);
    lines.push("```");
    lines.push("");
  }
}
