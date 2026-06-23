import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { KnownTargetKey } from "../../src/targets/target-registry.js";

export const profilesDir = fileURLToPath(new URL("../../profiles", import.meta.url));

export type RenderCombo = {
  enabledTargets: KnownTargetKey[];
  fixtureDir: string;
  profiles: string[];
  projectName: string;
  slug: string;
};

// The realistic deliverables: an architecture profile always paired with the
// typescript language profile, plus the all-three composition. dependencyCruiser
// is intentionally OFF for the composition because two active implementations are
// not yet supported by the renderer (see the negative test in render-matrix).
export const renderCombos: RenderCombo[] = [
  {
    enabledTargets: [
      "agentsMd",
      "claudeMd",
      "cursor",
      "dependencyCruiser",
      "githubActions",
      "prAgent",
      "claudeHooks",
    ],
    fixtureDir: fileURLToPath(new URL("../fixtures/projects/cli-ts", import.meta.url)),
    profiles: ["cli", "typescript"],
    projectName: "cli-sample",
    slug: "cli-ts",
  },
  {
    enabledTargets: [
      "agentsMd",
      "claudeMd",
      "cursor",
      "dependencyCruiser",
      "githubActions",
      "prAgent",
      "claudeHooks",
    ],
    fixtureDir: fileURLToPath(new URL("../fixtures/projects/mm-ts", import.meta.url)),
    profiles: ["modular-monolith", "typescript"],
    projectName: "monolith-sample",
    slug: "mm-ts",
  },
  {
    enabledTargets: ["agentsMd", "claudeMd", "cursor", "githubActions", "prAgent", "claudeHooks"],
    fixtureDir: fileURLToPath(new URL("../fixtures/projects/cli-mm-ts", import.meta.url)),
    profiles: ["cli", "modular-monolith", "typescript"],
    projectName: "composed-sample",
    slug: "cli-mm-ts",
  },
];

export function copyComboProject(fixtureDir: string): string {
  const projectDir = mkdtempSync(join(tmpdir(), "architect-companion-combo-"));
  cpSync(fixtureDir, projectDir, { recursive: true });
  return projectDir;
}

export function matrixGoldenPath(slug: string, outputPath: string): string {
  return fileURLToPath(new URL(`../fixtures/golden/matrix/${slug}/${outputPath}`, import.meta.url));
}

export function initGoldenPath(slug: string, fileName: string): string {
  return fileURLToPath(
    new URL(`../fixtures/golden/init-matrix/${slug}/${fileName}`, import.meta.url),
  );
}
