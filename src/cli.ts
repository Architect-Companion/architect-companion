#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { computeCapabilityWarnings } from "./diagnostics/capability-warnings.js";
import { defaultProfilesDir } from "./io/profiles-dir.js";
import { doctorReportHasIssues, formatDoctorReport, runDoctor } from "./diagnostics/doctor.js";
import { InitError, runInit } from "./init/init.js";
import { assertHarnessDirectoryAbsent } from "./init/preflight.js";
import { runInitWizard } from "./init/prompts.js";
import {
  discoverProfileNames,
  HarnessConfigError,
  knownTargetKeys,
  loadEffectiveHarnessModel,
  loadProfileMetadata,
  serializeEffectiveHarnessModel,
} from "./model/effective-model.js";
import type { KnownTargetKey } from "./model/effective-model.js";
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
  architect-companion init [--profile <name>]... [--language <name>]...
                           [--project-name <name>]
                           [--target <key>]... [--no-target <key>]...
                           [--no-render] [--dry-run]
                           [--project <dir>] [--profiles <dir>]
  architect-companion inspect effective-model [--project <dir>] [--profiles <dir>]
  architect-companion render [--project <dir>] [--profiles <dir>] [--check]
  architect-companion doctor [--project <dir>] [--profiles <dir>]
  architect-companion upgrade-profile [--project <dir>] [--profiles <dir>]

Options:
  -h, --help          Show this help message.
  -v, --version       Show the Architect Companion version.

Commands:
  init
      Bootstrap .architect-companion/ from selected profiles and render the
      enabled targets. Refuses to run when .architect-companion/ already exists.
      Runs an interactive wizard when stdin is a TTY and any input is missing
      from flags; otherwise uses sensible defaults or fails fast on missing
      required inputs.
  inspect effective-model
      Validate the harness inputs and print the resolved effective model as JSON.
  render
      Generate deterministic target files from the resolved effective model.
  doctor
      Diagnose adoption issues: missing tools, capability warnings, and profile lock status.
  upgrade-profile
      Update .architect-companion/profile.lock.yml to match the currently resolved profiles.
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

  if (firstArg === "init") {
    return runInitCommand(args.slice(1), io, options);
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

async function runInitCommand(args: string[], io: CliIo, options: CliOptions): Promise<number> {
  const parsedOptions = parseInitOptions(args, options);
  if (!parsedOptions.success) {
    io.stderr.write(`${parsedOptions.message}\n`);
    io.stderr.write("Run `architect-companion --help` for usage.\n");
    return 1;
  }

  try {
    await assertHarnessDirectoryAbsent(parsedOptions.options.projectDir);
  } catch (error: unknown) {
    if (error instanceof InitError) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }

  const resolution = await resolveInitInputs(parsedOptions.options, io);
  if (resolution === "cancelled") {
    return 130;
  }
  if (resolution === undefined) {
    return 1;
  }

  try {
    return await runInit(resolution, io);
  } catch (error: unknown) {
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
  }
}

function shouldRunWizard(parsed: InitParsedOptions): boolean {
  if (process.stdin.isTTY !== true) {
    return false;
  }
  const targetsExplicit = parsed.enabledTargets.length > 0 || parsed.disabledTargets.length > 0;
  return (
    parsed.profileNames.length === 0 ||
    parsed.languages.length === 0 ||
    parsed.projectName === undefined ||
    !targetsExplicit
  );
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
          `created ${PROFILE_LOCK_FILE_PATH} for ${formatLockedProfiles(lockStatus.expected.profiles)}\n`,
        );
        return 0;
      case "match":
        io.stdout.write(
          `${PROFILE_LOCK_FILE_PATH} already pinned ${formatLockedProfiles(lockStatus.expected.profiles)}; rewrote the lock file.\n`,
        );
        return 0;
      case "stale":
        io.stdout.write(
          `upgraded ${PROFILE_LOCK_FILE_PATH} from ${formatLockedProfiles(lockStatus.lock.profiles)} to ${formatLockedProfiles(lockStatus.expected.profiles)}\n`,
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

function formatLockedProfiles(
  profiles: Awaited<ReturnType<typeof resolveProfileLockStatus>>["expected"]["profiles"],
): string {
  return profiles.map((profile) => `${profile.name}@${profile.version}`).join(", ");
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
      const optionValue = parseFlagValue("--project", value, "directory");
      if (!optionValue.success) {
        return optionValue;
      }

      projectDir = resolve(cwd, optionValue.value);
      index += 1;
      continue;
    }

    if (flag === "--profiles") {
      const optionValue = parseFlagValue("--profiles", value, "directory");
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

type InitParsedOptions = ResolvedDirectoryOptions & {
  disabledTargets: KnownTargetKey[];
  dryRun: boolean;
  enabledTargets: KnownTargetKey[];
  languages: string[];
  noRender: boolean;
  profileNames: string[];
  projectName?: string;
};

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const IDENTIFIER_ERROR = "must use lowercase letters, numbers, and hyphens, starting with a letter";

function parseInitOptions(
  args: string[],
  options: CliOptions,
): DirectoryOptionsResult<InitParsedOptions> {
  const cwd = options.cwd ?? process.cwd();
  let projectDir = cwd;
  let profilesDir = options.profilesDir;
  const profileNames: string[] = [];
  const languages: string[] = [];
  let projectName: string | undefined;
  let noRender = false;
  let dryRun = false;
  const enabledTargets: KnownTargetKey[] = [];
  const disabledTargets: KnownTargetKey[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];

    if (flag === "--no-render") {
      noRender = true;
      continue;
    }

    if (flag === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (flag === "--profile") {
      const optionValue = parseFlagValue("--profile", value, "value");
      if (!optionValue.success) {
        return optionValue;
      }
      if (!IDENTIFIER_PATTERN.test(optionValue.value)) {
        return {
          message: `--profile ${IDENTIFIER_ERROR}.`,
          success: false,
        };
      }
      profileNames.push(optionValue.value);
      index += 1;
      continue;
    }

    if (flag === "--language") {
      const optionValue = parseFlagValue("--language", value, "value");
      if (!optionValue.success) {
        return optionValue;
      }
      if (!IDENTIFIER_PATTERN.test(optionValue.value)) {
        return {
          message: `--language ${IDENTIFIER_ERROR}.`,
          success: false,
        };
      }
      languages.push(optionValue.value);
      index += 1;
      continue;
    }

    if (flag === "--project-name") {
      const optionValue = parseFlagValue("--project-name", value, "value");
      if (!optionValue.success) {
        return optionValue;
      }
      if (!IDENTIFIER_PATTERN.test(optionValue.value)) {
        return {
          message: `--project-name ${IDENTIFIER_ERROR}.`,
          success: false,
        };
      }
      projectName = optionValue.value;
      index += 1;
      continue;
    }

    if (flag === "--target" || flag === "--no-target") {
      const optionValue = parseFlagValue(flag, value, "value");
      if (!optionValue.success) {
        return optionValue;
      }
      if (!(knownTargetKeys as readonly string[]).includes(optionValue.value)) {
        return {
          message: `${flag} must be one of: ${knownTargetKeys.join(", ")}.`,
          success: false,
        };
      }
      const targetKey = optionValue.value as KnownTargetKey;
      if (flag === "--target") {
        enabledTargets.push(targetKey);
      } else {
        disabledTargets.push(targetKey);
      }
      index += 1;
      continue;
    }

    if (flag === "--project") {
      const optionValue = parseFlagValue("--project", value, "directory");
      if (!optionValue.success) {
        return optionValue;
      }
      projectDir = resolve(cwd, optionValue.value);
      index += 1;
      continue;
    }

    if (flag === "--profiles") {
      const optionValue = parseFlagValue("--profiles", value, "directory");
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

  const conflictingTargets = enabledTargets.filter((target) => disabledTargets.includes(target));
  if (conflictingTargets.length > 0) {
    return {
      message: `target ${conflictingTargets[0]} cannot be both enabled (--target) and disabled (--no-target).`,
      success: false,
    };
  }

  const duplicateProfile = findDuplicate(profileNames);
  if (duplicateProfile !== undefined) {
    return {
      message: `--profile ${duplicateProfile} was provided more than once.`,
      success: false,
    };
  }

  const duplicateLanguage = findDuplicate(languages);
  if (duplicateLanguage !== undefined) {
    return {
      message: `--language ${duplicateLanguage} was provided more than once.`,
      success: false,
    };
  }

  const parsedOptions: InitParsedOptions = {
    disabledTargets,
    dryRun,
    enabledTargets,
    languages,
    noRender,
    profileNames,
    profilesDir,
    projectDir,
  };
  if (projectName !== undefined) {
    parsedOptions.projectName = projectName;
  }

  return {
    options: parsedOptions,
    success: true,
  };
}

async function resolveInitInputs(
  parsed: InitParsedOptions,
  io: CliIo,
): Promise<Parameters<typeof runInit>[0] | "cancelled" | undefined> {
  if (shouldRunWizard(parsed)) {
    return resolveInitInputsInteractive(parsed, io);
  }

  return resolveInitInputsNonInteractive(parsed, io);
}

async function resolveInitInputsNonInteractive(
  parsed: InitParsedOptions,
  io: CliIo,
): Promise<Parameters<typeof runInit>[0] | undefined> {
  let profileNames = parsed.profileNames;
  if (profileNames.length === 0) {
    try {
      const discovered = await discoverProfileNames(parsed.profilesDir);
      if (discovered.length === 0) {
        io.stderr.write(`No profiles installed in ${parsed.profilesDir}.\n`);
        return undefined;
      }
      if (discovered.length > 1) {
        io.stderr.write(
          `Multiple profiles installed (${discovered.join(", ")}); pass --profile <name> for each selected profile.\n`,
        );
        return undefined;
      }
      const onlyProfile = discovered[0];
      if (onlyProfile === undefined) {
        io.stderr.write(`No profiles installed in ${parsed.profilesDir}.\n`);
        return undefined;
      }
      profileNames = [onlyProfile];
    } catch (error: unknown) {
      if (error instanceof HarnessConfigError) {
        io.stderr.write(`${error.message}\n`);
        return undefined;
      }
      throw error;
    }
  }

  if (parsed.languages.length === 0) {
    io.stderr.write("At least one --language <name> is required.\n");
    return undefined;
  }

  const projectName = parsed.projectName ?? defaultProjectName(parsed.projectDir);

  const initInputs: Parameters<typeof runInit>[0] = {
    disabledTargets: parsed.disabledTargets,
    dryRun: parsed.dryRun,
    enabledTargets: parsed.enabledTargets,
    languages: parsed.languages,
    noRender: parsed.noRender,
    profileNames,
    profilesDir: parsed.profilesDir,
    projectDir: parsed.projectDir,
    projectName,
  };
  return initInputs;
}

async function resolveInitInputsInteractive(
  parsed: InitParsedOptions,
  io: CliIo,
): Promise<Parameters<typeof runInit>[0] | "cancelled" | undefined> {
  let installedProfiles: string[];
  try {
    installedProfiles = await discoverProfileNames(parsed.profilesDir);
  } catch (error: unknown) {
    if (error instanceof HarnessConfigError) {
      io.stderr.write(`${error.message}\n`);
      return undefined;
    }
    throw error;
  }

  const wizardOptions: Parameters<typeof runInitWizard>[0] = {
    defaultProjectName: defaultProjectName(parsed.projectDir),
    installedProfiles,
    loadProfile: async (name) => {
      try {
        return await loadProfileMetadata(parsed.profilesDir, name);
      } catch (error: unknown) {
        if (error instanceof HarnessConfigError) {
          throw new InitError(error.message);
        }
        throw error;
      }
    },
    presetTargetsExplicit: parsed.enabledTargets.length > 0 || parsed.disabledTargets.length > 0,
  };
  if (parsed.profileNames.length > 0) {
    wizardOptions.presetProfileNames = parsed.profileNames;
  }
  if (parsed.projectName !== undefined) {
    wizardOptions.presetProjectName = parsed.projectName;
  }
  if (parsed.languages.length > 0) {
    wizardOptions.presetLanguages = parsed.languages;
  }

  let result;
  try {
    result = await runInitWizard(wizardOptions);
  } catch (error: unknown) {
    if (error instanceof InitError) {
      io.stderr.write(`${error.message}\n`);
      return undefined;
    }
    throw error;
  }

  if (result.cancelled) {
    return "cancelled";
  }

  const initInputs: Parameters<typeof runInit>[0] = {
    disabledTargets:
      parsed.disabledTargets.length > 0 ? parsed.disabledTargets : result.disabledTargets,
    dryRun: parsed.dryRun,
    enabledTargets:
      parsed.enabledTargets.length > 0 ? parsed.enabledTargets : result.enabledTargets,
    languages: result.languages,
    noRender: parsed.noRender,
    profileNames: result.profileNames,
    profilesDir: parsed.profilesDir,
    projectDir: parsed.projectDir,
    projectName: result.projectName,
  };
  return initInputs;
}

function findDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }
  return undefined;
}

function defaultProjectName(projectDir: string): string {
  const base = basename(resolve(projectDir));
  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "");
  return sanitized.length > 0 ? sanitized : "project";
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
      const optionValue = parseFlagValue("--project", value, "directory");
      if (!optionValue.success) {
        return optionValue;
      }

      projectDir = resolve(cwd, optionValue.value);
      index += 1;
      continue;
    }

    if (flag === "--profiles") {
      const optionValue = parseFlagValue("--profiles", value, "directory");
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

function parseFlagValue(
  flag: string,
  value: string | undefined,
  noun: string,
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
      message: `${flag} requires a ${noun}.`,
      success: false,
    };
  }

  return {
    success: true,
    value,
  };
}
