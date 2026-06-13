import { access, constants, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { findSymlinkedSegment } from "../io/path-safety.js";
import {
  HarnessConfigError,
  knownTargetKeys,
  loadProfileMetadata,
} from "../model/effective-model.js";
import type {
  KnownTargetKey,
  ProfileMetadata,
  ProfileReference,
} from "../model/effective-model.js";
import { GENERATED_FILE_MARKER, getRendererOutputs, RenderError } from "../render/render.js";
import type { RendererOutput } from "../render/render.js";

import { InitError } from "./errors.js";
import { HARNESS_DIRECTORY } from "./scaffold.js";

const defaultTargets: Partial<Record<KnownTargetKey, boolean>> = {
  agentsMd: true,
};

export type PreflightOptions = {
  disabledTargets: KnownTargetKey[];
  enabledTargets: KnownTargetKey[];
  languages: string[];
  profileNames: string[];
  profilesDir: string;
  projectDir: string;
};

export type PreflightResolution = {
  languages: string[];
  mergedTargets: Record<KnownTargetKey, boolean>;
  preExistingDirectories: Set<string>;
  preExistingFiles: Set<string>;
  profileMetadata: ProfileMetadata[];
  profileReferences: ProfileReference[];
  renderOutputs: RendererOutput[];
  targets: Partial<Record<KnownTargetKey, boolean>>;
};

export async function runPreflight(options: PreflightOptions): Promise<PreflightResolution> {
  await assertHarnessDirectoryAbsent(options.projectDir);

  const profileMetadata = await loadProfiles(options.profilesDir, options.profileNames);
  const mergedTargets = mergeTargets(
    defaultTargets,
    options.enabledTargets,
    options.disabledTargets,
  );
  const renderOutputs = computeRenderOutputs(mergedTargets);
  const preExistence = await checkRenderOutputPreExistence(options.projectDir, renderOutputs);

  return {
    languages: options.languages,
    mergedTargets,
    preExistingDirectories: preExistence.directories,
    preExistingFiles: preExistence.files,
    profileMetadata,
    profileReferences: profileMetadata.map((metadata) => ({
      name: metadata.profile.name,
      version: metadata.profile.version,
    })),
    renderOutputs,
    targets: computeSelectedTargets(mergedTargets),
  };
}

export async function assertHarnessDirectoryAbsent(projectDir: string): Promise<void> {
  const harnessPath = path.join(projectDir, HARNESS_DIRECTORY);
  try {
    await access(harnessPath, constants.F_OK);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  throw new InitError(
    `${HARNESS_DIRECTORY}/ already exists in this project. Remove it before running \`architect-companion init\`, or use \`architect-companion upgrade-profile\` / \`architect-companion render\` to manage an existing harness.`,
  );
}

async function loadProfiles(
  profilesDir: string,
  profileNames: string[],
): Promise<ProfileMetadata[]> {
  const seen = new Set<string>();
  for (const profileName of profileNames) {
    if (seen.has(profileName)) {
      throw new InitError(`--profile ${profileName} was provided more than once.`);
    }
    seen.add(profileName);
  }

  try {
    return await Promise.all(
      profileNames.map((profileName) => loadProfileMetadata(profilesDir, profileName)),
    );
  } catch (error: unknown) {
    if (error instanceof HarnessConfigError) {
      throw new InitError(error.message);
    }
    throw error;
  }
}

function mergeTargets(
  defaults: Partial<Record<KnownTargetKey, boolean>>,
  enabledTargets: KnownTargetKey[],
  disabledTargets: KnownTargetKey[],
): Record<KnownTargetKey, boolean> {
  const merged = {} as Record<KnownTargetKey, boolean>;
  for (const target of knownTargetKeys) {
    merged[target] = defaults[target] === true;
  }
  for (const target of enabledTargets) {
    merged[target] = true;
  }
  for (const target of disabledTargets) {
    merged[target] = false;
  }
  return merged;
}

function computeSelectedTargets(
  mergedTargets: Record<KnownTargetKey, boolean>,
): Partial<Record<KnownTargetKey, boolean>> {
  const targets: Partial<Record<KnownTargetKey, boolean>> = {};
  for (const target of knownTargetKeys) {
    if (mergedTargets[target]) {
      targets[target] = true;
    }
  }
  return targets;
}

function computeRenderOutputs(mergedTargets: Record<KnownTargetKey, boolean>): RendererOutput[] {
  try {
    return getRendererOutputs(mergedTargets);
  } catch (error: unknown) {
    if (error instanceof RenderError) {
      throw new InitError(error.message);
    }
    throw error;
  }
}

type PreExistence = {
  directories: Set<string>;
  files: Set<string>;
};

async function checkRenderOutputPreExistence(
  projectDir: string,
  renderOutputs: RendererOutput[],
): Promise<PreExistence> {
  const conflicts: string[] = [];
  const preExistingFiles = new Set<string>();
  const preExistingDirectories = new Set<string>();

  for (const output of renderOutputs) {
    const absolutePath = path.join(projectDir, output.outputPath);

    const symlinkedSegment = await findSymlinkedSegment(projectDir, absolutePath);
    if (symlinkedSegment !== undefined) {
      conflicts.push(`${output.outputPath} (path contains a symbolic link)`);
      continue;
    }

    await recordPreExistingAncestors(projectDir, absolutePath, preExistingDirectories);

    let stats;
    try {
      stats = await stat(absolutePath);
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    if (!stats.isFile()) {
      conflicts.push(`${output.outputPath} (exists and is not a regular file)`);
      continue;
    }

    const existingContent = await readFile(absolutePath, "utf8");
    if (!hasGeneratedMarker(existingContent)) {
      conflicts.push(output.outputPath);
      continue;
    }

    preExistingFiles.add(absolutePath);
  }

  if (conflicts.length > 0) {
    const list = conflicts.map((entry) => `  - ${entry}`).join("\n");
    throw new InitError(
      `cannot initialize — the following file${conflicts.length === 1 ? "" : "s"} already exist${conflicts.length === 1 ? "s" : ""} and ${conflicts.length === 1 ? "is" : "are"} not managed by Architect Companion:\n${list}\nMove or delete these files, or add the generated-file marker line "${GENERATED_FILE_MARKER}" if Architect Companion should manage them.`,
    );
  }

  return { directories: preExistingDirectories, files: preExistingFiles };
}

async function recordPreExistingAncestors(
  projectDir: string,
  filePath: string,
  preExistingDirectories: Set<string>,
): Promise<void> {
  const resolvedProject = path.resolve(projectDir);
  let current = path.dirname(filePath);

  while (current !== resolvedProject && current.startsWith(`${resolvedProject}${path.sep}`)) {
    if (preExistingDirectories.has(current)) {
      return;
    }
    try {
      const stats = await stat(current);
      if (stats.isDirectory()) {
        preExistingDirectories.add(current);
      }
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") {
        // Stop walking once a missing ancestor is found.
        return;
      }
      throw error;
    }
    current = path.dirname(current);
  }
}

function hasGeneratedMarker(source: string): boolean {
  return source.split(/\r?\n/, 8).some((line) => line.includes(GENERATED_FILE_MARKER));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
