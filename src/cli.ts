#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { computeCapabilityWarnings } from "./diagnostics/capability-warnings.js";
import { doctorReportHasIssues, formatDoctorReport, runDoctor } from "./diagnostics/doctor.js";
import {
  HarnessConfigError,
  loadEffectiveHarnessModel,
  serializeEffectiveHarnessModel,
} from "./model/effective-model.js";
import {
  describeProfileLockStaleReason,
  PROFILE_LOCK_FILE_PATH,
  ProfileLockError,
  resolveProfileLockStatus,
  writeProfileLock,
} from "./model/profile-lock.js";
import { renderEffectiveHarnessModel, RenderError } from "./render/render.js";

export const HELP_TEXT = `Architect Companion

Usage:
  architect-companion [options]
  architect-companion inspect effective-model [--project <dir>] [--profiles <dir>]
  architect-companion render [--project <dir>] [--profiles <dir>] [--check]
  architect-companion doctor [--project <dir>] [--profiles <dir>]
  architect-companion upgrade-profile [--project <dir>] [--profiles <dir>]

Options:
  -h, --help          Show this help message.
  -v, --version       Show the Architect Companion version.

Commands:
  inspect effective-model
      Validate the harness inputs and print the resolved effective model as JSON.
  render
      Generate deterministic target files from the resolved effective model.
  doctor
      Diagnose adoption issues: missing tools, capability warnings, and profile lock status.
  upgrade-profile
      Update .architect-companion/profile.lock.yml to match the currently resolved profile.
`;

type Writable = {
  write(chunk: string): void;
};

type CliIo = {
  stderr: Writable;
  stdout: Writable;
};

type CliOptions = {
  cwd?: string;
  profilesDir: string;
  version: string;
};

const helpFlags = new Set(["-h", "--help"]);
const versionFlags = new Set(["-v", "--version"]);

type ResolvedDirectoryOptions = {
  profilesDir: string;
  projectDir: string;
};

type RenderOptions = ResolvedDirectoryOptions & {
  check: boolean;
};

type DirectoryOptionsResult<T extends ResolvedDirectoryOptions> =
  | {
      options: T;
      success: true;
    }
  | {
      message: string;
      success: false;
    };

export async function runCli(args: string[], io: CliIo, options: CliOptions): Promise<number> {
  const firstArg = args[0];

  if (
    args.length === 0 ||
    (args.length === 1 && firstArg !== undefined && helpFlags.has(firstArg))
  ) {
    io.stdout.write(HELP_TEXT);
    return 0;
  }

  if (args.length === 1 && firstArg !== undefined && versionFlags.has(firstArg)) {
    io.stdout.write(`${options.version}\n`);
    return 0;
  }

  if (firstArg === "inspect") {
    return runInspectCommand(args.slice(1), io, options);
  }

  if (firstArg === "render") {
    return runRenderCommand(args.slice(1), io, options);
  }

  if (firstArg === "doctor") {
    return runDoctorCommand(args.slice(1), io, options);
  }

  if (firstArg === "upgrade-profile") {
    return runUpgradeProfileCommand(args.slice(1), io, options);
  }

  io.stderr.write(`Unknown argument: ${firstArg ?? ""}\n`);
  io.stderr.write("Run `architect-companion --help` for usage.\n");
  return 1;
}

export async function readPackageVersion(baseUrl = import.meta.url): Promise<string> {
  const packageJsonUrl = new URL("../package.json", baseUrl);
  const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8")) as {
    version?: unknown;
  };

  if (typeof packageJson.version !== "string") {
    throw new Error("package.json is missing a string version field.");
  }

  return packageJson.version;
}

export async function main(argv = process.argv, io: CliIo = process): Promise<number> {
  const version = await readPackageVersion();
  return runCli(argv.slice(2), io, {
    cwd: process.cwd(),
    profilesDir: defaultProfilesDir(),
    version,
  });
}

export function isDirectRun(metaUrl: string, argvEntry = process.argv[1]): boolean {
  if (argvEntry === undefined) {
    return false;
  }

  return realpathSync(fileURLToPath(metaUrl)) === realpathSync(resolve(argvEntry));
}

if (isDirectRun(import.meta.url)) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}

async function runInspectCommand(args: string[], io: CliIo, options: CliOptions): Promise<number> {
  const target = args[0];

  if (target !== "effective-model") {
    io.stderr.write(`Unknown inspect target: ${target ?? ""}\n`);
    io.stderr.write("Run `architect-companion --help` for usage.\n");
    return 1;
  }

  const parsedOptions = parseDirectoryOptions(args.slice(1), options);
  if (!parsedOptions.success) {
    io.stderr.write(`${parsedOptions.message}\n`);
    io.stderr.write("Run `architect-companion --help` for usage.\n");
    return 1;
  }

  try {
    const model = await loadEffectiveHarnessModel(parsedOptions.options);
    io.stdout.write(serializeEffectiveHarnessModel(model));
    return 0;
  } catch (error: unknown) {
    if (error instanceof HarnessConfigError) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }

    throw error;
  }
}

async function runRenderCommand(args: string[], io: CliIo, options: CliOptions): Promise<number> {
  const parsedOptions = parseRenderOptions(args, options);
  if (!parsedOptions.success) {
    io.stderr.write(`${parsedOptions.message}\n`);
    io.stderr.write("Run `architect-companion --help` for usage.\n");
    return 1;
  }

  try {
    const model = await loadEffectiveHarnessModel(parsedOptions.options);

    const lockStatus = await resolveProfileLockStatus({
      model,
      profilesDir: parsedOptions.options.profilesDir,
      projectDir: parsedOptions.options.projectDir,
    });

    if (lockStatus.kind === "stale") {
      io.stderr.write(
        `${PROFILE_LOCK_FILE_PATH}: ${describeProfileLockStaleReason(lockStatus)}.\n`,
      );
      io.stderr.write(
        "Run `architect-companion upgrade-profile` after reviewing the profile changes.\n",
      );
      return 1;
    }

    for (const warning of computeCapabilityWarnings(model)) {
      io.stderr.write(`warning: ${warning.message}\n`);
    }

    const results = await renderEffectiveHarnessModel({
      check: parsedOptions.options.check,
      model,
      projectDir: parsedOptions.options.projectDir,
    });

    const staleResults = results.filter((result) => result.status === "stale");
    const lockMissing = lockStatus.kind === "missing";

    if (parsedOptions.options.check && lockMissing) {
      io.stderr.write(`${PROFILE_LOCK_FILE_PATH} is stale (missing).\n`);
    }

    for (const result of staleResults) {
      io.stderr.write(`${result.outputPath} is stale (${result.reason}).\n`);
    }

    if (parsedOptions.options.check) {
      if (staleResults.length > 0 || lockMissing) {
        return 1;
      }

      io.stdout.write("Generated targets are fresh.\n");
      return 0;
    }

    if (lockMissing) {
      await writeProfileLock(parsedOptions.options.projectDir, lockStatus.expected);
      io.stdout.write(`created ${PROFILE_LOCK_FILE_PATH}\n`);
    }

    if (results.length === 0) {
      if (!lockMissing) {
        io.stdout.write("No targets selected.\n");
      }
      return 0;
    }

    for (const result of results) {
      io.stdout.write(`${result.status} ${result.outputPath}\n`);
    }
    return 0;
  } catch (error: unknown) {
    if (
      error instanceof HarnessConfigError ||
      error instanceof RenderError ||
      error instanceof ProfileLockError
    ) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }

    throw error;
  }
}

async function runDoctorCommand(args: string[], io: CliIo, options: CliOptions): Promise<number> {
  const parsedOptions = parseDirectoryOptions(args, options);
  if (!parsedOptions.success) {
    io.stderr.write(`${parsedOptions.message}\n`);
    io.stderr.write("Run `architect-companion --help` for usage.\n");
    return 1;
  }

  try {
    const model = await loadEffectiveHarnessModel(parsedOptions.options);
    const report = await runDoctor({
      model,
      profilesDir: parsedOptions.options.profilesDir,
      projectDir: parsedOptions.options.projectDir,
    });
    io.stdout.write(formatDoctorReport(report));
    return doctorReportHasIssues(report) ? 1 : 0;
  } catch (error: unknown) {
    if (error instanceof HarnessConfigError || error instanceof ProfileLockError) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }

    throw error;
  }
}

async function runUpgradeProfileCommand(
  args: string[],
  io: CliIo,
  options: CliOptions,
): Promise<number> {
  const parsedOptions = parseDirectoryOptions(args, options);
  if (!parsedOptions.success) {
    io.stderr.write(`${parsedOptions.message}\n`);
    io.stderr.write("Run `architect-companion --help` for usage.\n");
    return 1;
  }

  try {
    const model = await loadEffectiveHarnessModel(parsedOptions.options);
    const lockStatus = await resolveProfileLockStatus({
      model,
      profilesDir: parsedOptions.options.profilesDir,
      projectDir: parsedOptions.options.projectDir,
    });

    await writeProfileLock(parsedOptions.options.projectDir, lockStatus.expected);

    switch (lockStatus.kind) {
      case "missing":
        io.stdout.write(
          `created ${PROFILE_LOCK_FILE_PATH} for ${lockStatus.expected.profile.name}@${lockStatus.expected.profile.version}\n`,
        );
        return 0;
      case "match":
        io.stdout.write(
          `${PROFILE_LOCK_FILE_PATH} already pinned ${lockStatus.expected.profile.name}@${lockStatus.expected.profile.version}; rewrote the lock file.\n`,
        );
        return 0;
      case "stale":
        io.stdout.write(
          `upgraded ${PROFILE_LOCK_FILE_PATH} from ${lockStatus.lock.profile.name}@${lockStatus.lock.profile.version} to ${lockStatus.expected.profile.name}@${lockStatus.expected.profile.version}\n`,
        );
        return 0;
    }
  } catch (error: unknown) {
    if (error instanceof HarnessConfigError || error instanceof ProfileLockError) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }

    throw error;
  }
}

function parseDirectoryOptions(
  args: string[],
  options: CliOptions,
): DirectoryOptionsResult<ResolvedDirectoryOptions> {
  const cwd = options.cwd ?? process.cwd();
  let projectDir = cwd;
  let profilesDir = options.profilesDir;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];

    if (flag === "--project") {
      const optionValue = parseDirectoryOptionValue("--project", value);
      if (!optionValue.success) {
        return optionValue;
      }

      projectDir = resolve(cwd, optionValue.value);
      index += 1;
      continue;
    }

    if (flag === "--profiles") {
      const optionValue = parseDirectoryOptionValue("--profiles", value);
      if (!optionValue.success) {
        return optionValue;
      }

      profilesDir = resolve(cwd, optionValue.value);
      index += 1;
      continue;
    }

    return {
      message: `Unknown argument: ${flag ?? ""}`,
      success: false,
    };
  }

  return {
    options: {
      profilesDir,
      projectDir,
    },
    success: true,
  };
}

function parseRenderOptions(
  args: string[],
  options: CliOptions,
): DirectoryOptionsResult<RenderOptions> {
  const cwd = options.cwd ?? process.cwd();
  let check = false;
  let projectDir = cwd;
  let profilesDir = options.profilesDir;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];

    if (flag === "--check") {
      check = true;
      continue;
    }

    if (flag === "--project") {
      const optionValue = parseDirectoryOptionValue("--project", value);
      if (!optionValue.success) {
        return optionValue;
      }

      projectDir = resolve(cwd, optionValue.value);
      index += 1;
      continue;
    }

    if (flag === "--profiles") {
      const optionValue = parseDirectoryOptionValue("--profiles", value);
      if (!optionValue.success) {
        return optionValue;
      }

      profilesDir = resolve(cwd, optionValue.value);
      index += 1;
      continue;
    }

    return {
      message: `Unknown argument: ${flag ?? ""}`,
      success: false,
    };
  }

  return {
    options: {
      check,
      profilesDir,
      projectDir,
    },
    success: true,
  };
}

function parseDirectoryOptionValue(
  flag: string,
  value: string | undefined,
):
  | {
      success: true;
      value: string;
    }
  | {
      message: string;
      success: false;
    } {
  if (value === undefined || value.trim() === "" || value.startsWith("--")) {
    return {
      message: `${flag} requires a directory.`,
      success: false,
    };
  }

  return {
    success: true,
    value,
  };
}

function defaultProfilesDir(): string {
  return fileURLToPath(new URL("../profiles", import.meta.url));
}
