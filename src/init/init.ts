import { rm, rmdir } from "node:fs/promises";
import path from "node:path";

import { HarnessConfigError, loadEffectiveHarnessModel } from "../model/effective-model.js";
import type { KnownTargetKey, SupportedStack } from "../model/effective-model.js";
import {
  PROFILE_LOCK_FILE_PATH,
  ProfileLockError,
  resolveProfileLockStatus,
  writeProfileLock,
} from "../model/profile-lock.js";
import { RenderError, renderEffectiveHarnessModel } from "../render/render.js";

import { InitError } from "./errors.js";
import { runPreflight } from "./preflight.js";
import type { PreflightResolution } from "./preflight.js";
import {
  formatHarnessYaml,
  formatModulesYaml,
  HARNESS_DIRECTORY,
  HARNESS_FILE_PATH,
  MODULES_FILE_PATH,
  writeScaffoldFiles,
} from "./scaffold.js";

export { InitError } from "./errors.js";

type Writable = {
  write(chunk: string): void;
};

export type InitIo = {
  stderr: Writable;
  stdout: Writable;
};

export type InitInputs = {
  disabledTargets: KnownTargetKey[];
  dryRun: boolean;
  enabledTargets: KnownTargetKey[];
  noRender: boolean;
  profileName: string;
  profilesDir: string;
  projectDir: string;
  projectName: string;
  stack?: SupportedStack;
};

type RollbackTracker = {
  createdDirectories: string[];
  createdFiles: string[];
  harnessDirectoryCreated: boolean;
  projectDir: string;
};

export async function runInit(inputs: InitInputs, io: InitIo): Promise<number> {
  const preflight = await runPreflight({
    disabledTargets: inputs.disabledTargets,
    enabledTargets: inputs.enabledTargets,
    profileName: inputs.profileName,
    profilesDir: inputs.profilesDir,
    projectDir: inputs.projectDir,
    ...(inputs.stack !== undefined ? { stack: inputs.stack } : {}),
  });

  if (inputs.dryRun) {
    writeDryRunPlan(io, inputs, preflight);
    return 0;
  }

  const tracker: RollbackTracker = {
    createdDirectories: [],
    createdFiles: [],
    harnessDirectoryCreated: false,
    projectDir: inputs.projectDir,
  };

  const sigintHandler = () => {
    void (async () => {
      io.stderr.write("\ninit cancelled.\n");
      await rollback(tracker);
      process.exit(130);
    })();
  };

  process.once("SIGINT", sigintHandler);

  try {
    io.stdout.write(
      `Profile: ${preflight.profileMetadata.profile.name}@${preflight.profileMetadata.profile.version}\n`,
    );
    io.stdout.write(`Stack: ${preflight.resolvedStack}\n`);
    io.stdout.write(`Project: ${inputs.projectName}\n`);

    const scaffoldResult = await writeScaffoldFiles(inputs.projectDir, {
      profileName: preflight.profileMetadata.profile.name,
      profileVersion: preflight.profileMetadata.profile.version,
      projectName: inputs.projectName,
      targetOverrides: preflight.targetOverrides,
      ...(preflight.stackOverride !== undefined ? { stack: preflight.stackOverride } : {}),
    });
    tracker.harnessDirectoryCreated = true;
    tracker.createdDirectories.push(...scaffoldResult.createdDirs);
    tracker.createdFiles.push(...scaffoldResult.createdFiles);

    io.stdout.write(`created ${HARNESS_FILE_PATH}\n`);
    io.stdout.write(`created ${MODULES_FILE_PATH}\n`);

    const model = await loadEffectiveHarnessModel({
      profilesDir: inputs.profilesDir,
      projectDir: inputs.projectDir,
    });

    const lockStatus = await resolveProfileLockStatus({
      model,
      profilesDir: inputs.profilesDir,
      projectDir: inputs.projectDir,
    });

    await writeProfileLock(inputs.projectDir, lockStatus.expected);
    tracker.createdFiles.push(path.join(inputs.projectDir, PROFILE_LOCK_FILE_PATH));
    io.stdout.write(`created ${PROFILE_LOCK_FILE_PATH}\n`);

    if (inputs.noRender) {
      io.stdout.write(
        "\nSkipped rendering (--no-render). Run `architect-companion render` when ready.\n",
      );
    } else {
      for (const output of preflight.renderOutputs) {
        const absolutePath = path.join(inputs.projectDir, output.outputPath);
        if (!preflight.preExistingFiles.has(absolutePath)) {
          tracker.createdFiles.push(absolutePath);
        }
        for (const parentDir of collectParentDirectories(inputs.projectDir, absolutePath)) {
          if (!preflight.preExistingDirectories.has(parentDir)) {
            tracker.createdDirectories.push(parentDir);
          }
        }
      }

      const results = await renderEffectiveHarnessModel({ model, projectDir: inputs.projectDir });

      for (const result of results) {
        io.stdout.write(`${result.status} ${result.outputPath}\n`);
      }
    }

    io.stdout.write(
      `\nNext: declare your modules in ${MODULES_FILE_PATH}, then run \`architect-companion render\`.\n`,
    );

    return 0;
  } catch (error: unknown) {
    await rollback(tracker);

    if (
      error instanceof InitError ||
      error instanceof HarnessConfigError ||
      error instanceof RenderError ||
      error instanceof ProfileLockError
    ) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }

    throw error;
  } finally {
    process.off("SIGINT", sigintHandler);
  }
}

async function rollback(tracker: RollbackTracker): Promise<void> {
  for (const filePath of tracker.createdFiles) {
    await rm(filePath, { force: true });
  }

  const dirsDeepestFirst = [...new Set(tracker.createdDirectories)].sort(
    (left, right) => right.length - left.length,
  );

  for (const dirPath of dirsDeepestFirst) {
    try {
      await rmdir(dirPath);
    } catch {
      // Directory was not empty or never existed; leave it alone.
    }
  }

  if (tracker.harnessDirectoryCreated) {
    await rm(path.join(tracker.projectDir, HARNESS_DIRECTORY), {
      force: true,
      recursive: true,
    });
  }
}

function writeDryRunPlan(io: InitIo, inputs: InitInputs, preflight: PreflightResolution): void {
  io.stdout.write("Pre-flight: OK\n\n");

  const harnessYaml = formatHarnessYaml({
    profileName: preflight.profileMetadata.profile.name,
    profileVersion: preflight.profileMetadata.profile.version,
    projectName: inputs.projectName,
    targetOverrides: preflight.targetOverrides,
    ...(preflight.stackOverride !== undefined ? { stack: preflight.stackOverride } : {}),
  });

  const modulesYaml = formatModulesYaml();

  io.stdout.write(`Would create ${HARNESS_FILE_PATH}:\n`);
  io.stdout.write(indentBlock(harnessYaml));
  io.stdout.write("\n");

  io.stdout.write(`Would create ${MODULES_FILE_PATH}:\n`);
  io.stdout.write(indentBlock(modulesYaml));
  io.stdout.write("\n");

  io.stdout.write(`Would create ${PROFILE_LOCK_FILE_PATH}\n`);

  if (inputs.noRender) {
    io.stdout.write("Would skip rendering (--no-render).\n");
  } else if (preflight.renderOutputs.length === 0) {
    io.stdout.write("Would run render, producing no target files (no targets selected).\n");
  } else {
    io.stdout.write("Would run render, producing:\n");
    for (const output of preflight.renderOutputs) {
      io.stdout.write(`  ${output.outputPath}\n`);
    }
  }

  io.stdout.write("\nNo files written (dry-run).\n");
}

function indentBlock(value: string): string {
  return value
    .split("\n")
    .map((line) => (line.length === 0 ? line : `  ${line}`))
    .join("\n");
}

function collectParentDirectories(projectDir: string, filePath: string): string[] {
  const resolvedProject = path.resolve(projectDir);
  const dirs: string[] = [];
  let current = path.dirname(filePath);

  while (current !== resolvedProject && current.startsWith(`${resolvedProject}${path.sep}`)) {
    dirs.push(current);
    current = path.dirname(current);
  }

  return dirs;
}
