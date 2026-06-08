import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { stringify } from "yaml";

import type { KnownTargetKey, SupportedStack } from "../model/effective-model.js";

export const HARNESS_DIRECTORY = ".architect-companion";
export const MODULES_RELATIVE_PATH = "architecture/modules.yml";
export const HARNESS_FILE_PATH = `${HARNESS_DIRECTORY}/harness.yml`;
export const MODULES_FILE_PATH = `${HARNESS_DIRECTORY}/${MODULES_RELATIVE_PATH}`;

export type HarnessScaffold = {
  profileName: string;
  profileVersion: string;
  projectName: string;
  stack?: SupportedStack;
  targetOverrides: Partial<Record<KnownTargetKey, boolean>>;
};

export function formatHarnessYaml(scaffold: HarnessScaffold): string {
  const data: Record<string, unknown> = {
    schemaVersion: 1,
    profile: {
      name: scaffold.profileName,
      version: scaffold.profileVersion,
    },
    project: {
      name: scaffold.projectName,
    },
    modules: MODULES_RELATIVE_PATH,
  };

  if (scaffold.stack !== undefined) {
    data.stack = scaffold.stack;
  }

  if (Object.keys(scaffold.targetOverrides).length > 0) {
    data.targets = scaffold.targetOverrides;
  }

  return stringify(data, { lineWidth: 0 });
}

export function formatModulesYaml(): string {
  return stringify(
    {
      schemaVersion: 1,
      modules: [],
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
  const modulesDir = path.dirname(path.join(projectDir, MODULES_FILE_PATH));
  const harnessFile = path.join(projectDir, HARNESS_FILE_PATH);
  const modulesFile = path.join(projectDir, MODULES_FILE_PATH);

  await mkdir(modulesDir, { recursive: true });
  await writeFile(harnessFile, formatHarnessYaml(scaffold), "utf8");
  await writeFile(modulesFile, formatModulesYaml(), "utf8");

  return {
    createdDirs: [harnessDir, modulesDir],
    createdFiles: [harnessFile, modulesFile],
  };
}
