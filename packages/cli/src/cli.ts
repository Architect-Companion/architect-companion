#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HarnessConfigError,
  defaultProfilesDir,
  loadEffectiveHarnessModel,
  parseHarnessFromYaml,
  serializeEffectiveHarnessModel,
} from "@architect-companion/core";

export const HELP_TEXT = `Architect Companion

Usage:
  architect-companion [options]
  architect-companion inspect effective-model [--project <dir>] [--profiles <dir>]
  architect-companion init [--project <dir>] [--server <url>]

Options:
  -h, --help          Show this help message.
  -v, --version       Show the Architect Companion version.

Commands:
  inspect effective-model
      Validate the harness inputs and print the resolved effective model as JSON.

  init
      Call the render API and write architecture artifacts to the project directory.
      Reads .architect-companion/harness.yml and the referenced modules file.
      --server <url>  Server base URL (default: http://localhost:3000)
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

  if (firstArg === "init") {
    return runInitCommand(args.slice(1), io, options);
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

type InitOptions = {
  projectDir: string;
  serverUrl: string;
};

type InitOptionsResult =
  | { options: InitOptions; success: true }
  | { message: string; success: false };

async function runInitCommand(args: string[], io: CliIo, options: CliOptions): Promise<number> {
  const parsedOptions = parseInitOptions(args, options);
  if (!parsedOptions.success) {
    io.stderr.write(`${parsedOptions.message}\n`);
    io.stderr.write("Run `architect-companion --help` for usage.\n");
    return 1;
  }

  const { projectDir, serverUrl } = parsedOptions.options;
  const harnessDir = join(projectDir, ".architect-companion");

  let harnessYaml: string;
  try {
    harnessYaml = await readFile(join(harnessDir, "harness.yml"), "utf8");
  } catch {
    io.stderr.write(`No .architect-companion/harness.yml found in ${projectDir}\n`);
    return 1;
  }

  let harness: ReturnType<typeof parseHarnessFromYaml>;
  try {
    harness = parseHarnessFromYaml(harnessYaml);
  } catch (error) {
    if (error instanceof HarnessConfigError) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }

  let modulesYaml: string;
  try {
    modulesYaml = await readFile(join(harnessDir, harness.modules), "utf8");
  } catch {
    io.stderr.write(`Modules file not found: ${join(harnessDir, harness.modules)}\n`);
    return 1;
  }

  const body: Record<string, unknown> = {
    profileName: harness.profile.name,
    profileVersion: harness.profile.version,
    projectName: harness.project.name,
    modulesYaml,
  };
  if (harness.stack !== undefined) body["stack"] = harness.stack;
  if (harness.targets !== undefined) body["targets"] = harness.targets;

  let response: Response;
  try {
    response = await fetch(`${serverUrl}/api/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    io.stderr.write(`Could not reach server at ${serverUrl}. Is it running?\n`);
    return 1;
  }

  const data = (await response.json()) as { files?: Record<string, string>; error?: string };

  if (!response.ok) {
    io.stderr.write(`Render failed: ${data.error ?? "unknown error"}\n`);
    return 1;
  }

  const files = data.files ?? {};
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(projectDir, filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf8");
    io.stdout.write(`  wrote ${filePath}\n`);
  }

  io.stdout.write(`\nInitialized ${harness.project.name}.\n`);
  return 0;
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

function parseInitOptions(args: string[], options: CliOptions): InitOptionsResult {
  const cwd = options.cwd ?? process.cwd();
  let projectDir = cwd;
  let serverUrl = process.env["AC_SERVER_URL"] ?? "http://localhost:3000";

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

    if (flag === "--server") {
      if (value === undefined || value.trim() === "" || value.startsWith("--")) {
        return { message: "--server requires a URL.", success: false };
      }
      serverUrl = value;
      index += 1;
      continue;
    }

    return { message: `Unknown argument: ${flag ?? ""}`, success: false };
  }

  return { options: { projectDir, serverUrl }, success: true };
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
