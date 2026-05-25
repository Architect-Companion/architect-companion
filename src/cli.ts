#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HarnessConfigError,
  loadEffectiveHarnessModel,
  serializeEffectiveHarnessModel,
} from "./model/effective-model.js";
import { renderEffectiveHarnessModel, RenderError } from "./render/render.js";

export const HELP_TEXT = `Architect Companion

Usage:
  architect-companion [options]
  architect-companion inspect effective-model [--project <dir>] [--profiles <dir>]
  architect-companion render [--project <dir>] [--profiles <dir>] [--check]

Options:
  -h, --help          Show this help message.
  -v, --version       Show the Architect Companion version.

Commands:
  inspect effective-model
      Validate the harness inputs and print the resolved effective model as JSON.
  render
      Generate deterministic target files from the resolved effective model.
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

type InspectOptions = {
  profilesDir: string;
  projectDir: string;
};

type InspectOptionsResult =
  | {
      options: InspectOptions;
      success: true;
    }
  | {
      message: string;
      success: false;
    };

type RenderOptions = {
  check: boolean;
  profilesDir: string;
  projectDir: string;
};

type RenderOptionsResult =
  | {
      options: RenderOptions;
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

  const parsedOptions = parseInspectOptions(args.slice(1), options);
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
    const results = await renderEffectiveHarnessModel({
      check: parsedOptions.options.check,
      model,
      projectDir: parsedOptions.options.projectDir,
    });

    const staleResults = results.filter((result) => result.status === "stale");
    if (staleResults.length > 0) {
      for (const result of staleResults) {
        io.stderr.write(`${result.outputPath} is stale (${result.reason}).\n`);
      }
      return 1;
    }

    if (parsedOptions.options.check) {
      io.stdout.write("Generated targets are fresh.\n");
      return 0;
    }

    if (results.length === 0) {
      io.stdout.write("No targets selected.\n");
      return 0;
    }

    for (const result of results) {
      io.stdout.write(`${result.status} ${result.outputPath}\n`);
    }
    return 0;
  } catch (error: unknown) {
    if (error instanceof HarnessConfigError || error instanceof RenderError) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }

    throw error;
  }
}

function parseInspectOptions(args: string[], options: CliOptions): InspectOptionsResult {
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

function parseRenderOptions(args: string[], options: CliOptions): RenderOptionsResult {
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
