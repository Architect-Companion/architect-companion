import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildEffectiveHarnessModel, HarnessConfigError } from "@architect-companion/core";

import { findProfile } from "../profiles/service.js";
import {
  AgentsMdRenderer,
  CursorRenderer,
  DependencyCruiserRenderer,
  GithubActionsRenderer,
} from "../renderers/index.js";
import type { RenderRequest, RenderResponse } from "./types.js";

const dataDir = resolve(process.env["AC_DATA_DIR"] ?? "./data");
const artifactsDir = join(dataDir, "artifacts");

const renderers = [
  new AgentsMdRenderer(),
  new CursorRenderer(),
  new DependencyCruiserRenderer(),
  new GithubActionsRenderer(),
];

export async function renderForProject(request: RenderRequest): Promise<RenderResponse> {
  const profileYaml = await findProfile(request.profileName, request.profileVersion);
  if (profileYaml === undefined) {
    throw new HarnessConfigError(
      `Profile "${request.profileName}@${request.profileVersion}" not found.`,
    );
  }

  const buildOptions = {
    modulesYaml: request.modulesYaml,
    profileYaml,
    project: { name: request.projectName },
  };

  const model = buildEffectiveHarnessModel(
    request.stack !== undefined || request.targets !== undefined
      ? {
          ...buildOptions,
          ...(request.stack !== undefined && { stack: request.stack }),
          ...(request.targets !== undefined && { targets: request.targets }),
        }
      : buildOptions,
  );

  const allFiles: Record<string, string> = {};
  for (const renderer of renderers) {
    const result = renderer.render(model);
    Object.assign(allFiles, result.files);
  }

  for (const [filePath, content] of Object.entries(allFiles)) {
    const fullPath = join(artifactsDir, request.projectName, filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf8");
  }

  return { files: allFiles, projectName: request.projectName };
}
