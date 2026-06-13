import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { stringify } from "yaml";

import type { KnownTargetKey, ProfileReference } from "../model/effective-model.js";

export const HARNESS_DIRECTORY = ".architect-companion";
export const BOUNDARIES_RELATIVE_PATH = "architecture/boundaries.yml";
export const HARNESS_FILE_PATH = `${HARNESS_DIRECTORY}/harness.yml`;
export const BOUNDARIES_FILE_PATH = `${HARNESS_DIRECTORY}/${BOUNDARIES_RELATIVE_PATH}`;

export type HarnessScaffold = {
  languages: string[];
  profiles: ProfileReference[];
  projectName: string;
  targets: Partial<Record<KnownTargetKey, boolean>>;
};

export function formatHarnessYaml(scaffold: HarnessScaffold): string {
  const data: Record<string, unknown> = {
    schemaVersion: 1,
    profiles: scaffold.profiles,
    project: {
      name: scaffold.projectName,
      languages: scaffold.languages,
    },
    boundaries: BOUNDARIES_RELATIVE_PATH,
    targets: scaffold.targets,
  };

  return stringify(data, { lineWidth: 0 });
}

export function formatBoundariesYaml(): string {
  return stringify(
    {
      schemaVersion: 1,
      boundaries: [],
      allowed_dependencies: {},
    },
    { lineWidth: 0 },
  );
}

export type ScaffoldWriteResult = {
  createdDirs: string[];
  createdFiles: string[];
};

export async function writeScaffoldFiles(
  projectDir: string,
  scaffold: HarnessScaffold,
): Promise<ScaffoldWriteResult> {
  const harnessDir = path.join(projectDir, HARNESS_DIRECTORY);
  const boundariesDir = path.dirname(path.join(projectDir, BOUNDARIES_FILE_PATH));
  const harnessFile = path.join(projectDir, HARNESS_FILE_PATH);
  const boundariesFile = path.join(projectDir, BOUNDARIES_FILE_PATH);

  await mkdir(boundariesDir, { recursive: true });
  await writeFile(harnessFile, formatHarnessYaml(scaffold), "utf8");
  await writeFile(boundariesFile, formatBoundariesYaml(), "utf8");

  return {
    createdDirs: [harnessDir, boundariesDir],
    createdFiles: [harnessFile, boundariesFile],
  };
}
