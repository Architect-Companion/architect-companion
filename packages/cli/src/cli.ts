#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
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
  architect-companion init [--server <url>]
  architect-companion pull [--server <url>]

Options:
  -h, --help          Show this help message.
  -v, --version       Show the Architect Companion version.

Commands:
  inspect effective-model [--project <dir>] [--profiles <dir>]
      Validate harness inputs and print the resolved effective model as JSON.

  init [--server <url>]
      Render architecture artifacts for this project on the server.
      Detects the git root, reads .architect-companion/harness.yml, and
      derives the project name from the git remote URL.

  pull [--server <url>]
      Download rendered artifacts and write them to the project based on
      detected tooling (GitHub Actions, Claude Code, Cursor).
      Run init first to render artifacts on the server.

  --server <url>      Server base URL (default: http://localhost:3000)
                      Can also be set via AC_SERVER_URL env variable.
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

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function findGitRoot(startDir: string): string | undefined {
  let current = startDir;
  while (true) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function getGitRemoteUrl(gitRoot: string): string | undefined {
  try {
    return execSync("git remote get-url origin", {
      cwd: gitRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return undefined;
  }
}

function projectNameFromGit(gitRoot: string): string {
  const url = getGitRemoteUrl(gitRoot);
  if (url !== undefined) {
    // https://github.com/user/my-repo.git  →  my-repo
    // git@github.com:user/my-repo.git      →  my-repo
    const match = url.match(/\/([^/:]+?)(?:\.git)?$/);
    if (match?.[1] !== undefined) return match[1];
  }
  return basename(gitRoot);
}

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

type DetectedEnv = {
  hasClaudeCode: boolean;
  hasCursor: boolean;
  hasGithub: boolean;
};

function detectEnv(projectDir: string, gitRoot: string): DetectedEnv {
  const remoteUrl = getGitRemoteUrl(gitRoot);
  const isGithubRemote = remoteUrl?.includes("github.com") ?? false;

  return {
    hasClaudeCode:
      existsSync(join(projectDir, ".claude")) || existsSync(join(projectDir, "CLAUDE.md")),
    hasCursor: existsSync(join(projectDir, ".cursor")),
    hasGithub: existsSync(join(projectDir, ".github")) || isGithubRemote,
  };
}

function envSummary(env: DetectedEnv): string {
  const parts = [
    env.hasGithub ? "GitHub Actions" : null,
    env.hasClaudeCode ? "Claude Code" : null,
    env.hasCursor ? "Cursor" : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(", ") : "none";
}

// Route an artifact path to its local destination.
// Returns null if the artifact should be skipped for this environment.
function routeArtifact(artifactPath: string, env: DetectedEnv): string | null {
  if (artifactPath.startsWith(".github/")) return env.hasGithub ? artifactPath : null;
  if (artifactPath.startsWith(".cursor/")) return env.hasCursor ? artifactPath : null;
  if (artifactPath.startsWith(".claude/")) return env.hasClaudeCode ? artifactPath : null;
  return artifactPath;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

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

  if (firstArg === "inspect") return runInspectCommand(args.slice(1), io, options);
  if (firstArg === "init") return runInitCommand(args.slice(1), io, options);
  if (firstArg === "pull") return runPullCommand(args.slice(1), io, options);

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
  if (argvEntry === undefined) return false;
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

// ---------------------------------------------------------------------------
// inspect effective-model
// ---------------------------------------------------------------------------

type InspectOptions = { profilesDir: string; projectDir: string };
type InspectOptionsResult =
  | { options: InspectOptions; success: true }
  | { message: string; success: false };

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

// ---------------------------------------------------------------------------
// init — render artifacts on the server
// ---------------------------------------------------------------------------

async function runInitCommand(args: string[], io: CliIo, options: CliOptions): Promise<number> {
  const parsedOptions = parseServerOptions(args, options);
  if (!parsedOptions.success) {
    io.stderr.write(`${parsedOptions.message}\n`);
    io.stderr.write("Run `architect-companion --help` for usage.\n");
    return 1;
  }

  const { serverUrl } = parsedOptions.options;
  const cwd = options.cwd ?? process.cwd();

  const gitRoot = findGitRoot(cwd);
  if (gitRoot === undefined) {
    io.stderr.write("No git repository found. Run init from within a git project.\n");
    return 1;
  }

  const projectName = projectNameFromGit(gitRoot);
  io.stdout.write(`Project: ${projectName}\n`);

  const harnessDir = join(gitRoot, ".architect-companion");

  let harnessYaml: string;
  try {
    harnessYaml = await readFile(join(harnessDir, "harness.yml"), "utf8");
  } catch {
    io.stderr.write(
      `No .architect-companion/harness.yml found in ${gitRoot}.\n` +
        `Create one to configure which profile and modules to use.\n`,
    );
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
    projectName,
    modulesYaml,
  };
  if (harness.stack !== undefined) body["stack"] = harness.stack;
  if (harness.targets !== undefined) body["targets"] = harness.targets;

  io.stdout.write(`Rendering via ${serverUrl}…\n`);

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

  const count = Object.keys(data.files ?? {}).length;
  io.stdout.write(
    `Rendered ${count} artifact${count === 1 ? "" : "s"} for "${projectName}".\n` +
      `Run \`architect-companion pull\` to apply them.\n`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// pull — apply artifacts to the local project
// ---------------------------------------------------------------------------

async function runPullCommand(args: string[], io: CliIo, options: CliOptions): Promise<number> {
  const parsedOptions = parseServerOptions(args, options);
  if (!parsedOptions.success) {
    io.stderr.write(`${parsedOptions.message}\n`);
    io.stderr.write("Run `architect-companion --help` for usage.\n");
    return 1;
  }

  const { serverUrl } = parsedOptions.options;
  const cwd = options.cwd ?? process.cwd();

  const gitRoot = findGitRoot(cwd);
  if (gitRoot === undefined) {
    io.stderr.write("No git repository found. Run pull from within a git project.\n");
    return 1;
  }

  const projectName = projectNameFromGit(gitRoot);
  const env = detectEnv(gitRoot, gitRoot);

  io.stdout.write(`Project:  ${projectName}\n`);
  io.stdout.write(`Detected: ${envSummary(env)}\n`);
  io.stdout.write("\n");

  let response: Response;
  try {
    response = await fetch(`${serverUrl}/api/artifacts/${projectName}`);
  } catch {
    io.stderr.write(`Could not reach server at ${serverUrl}. Is it running?\n`);
    return 1;
  }

  if (response.status === 404) {
    io.stderr.write(
      `No artifacts found for "${projectName}".\n` +
        `Run \`architect-companion init\` first.\n`,
    );
    return 1;
  }

  if (!response.ok) {
    io.stderr.write("Failed to fetch artifacts from server.\n");
    return 1;
  }

  const data = (await response.json()) as { files: Record<string, string> };
  const files = data.files ?? {};

  let written = 0;
  let skipped = 0;

  for (const [artifactPath, content] of Object.entries(files)) {
    const destination = routeArtifact(artifactPath, env);
    if (destination === null) {
      skipped += 1;
      continue;
    }

    const fullPath = join(gitRoot, destination);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf8");
    io.stdout.write(`  wrote  ${destination}\n`);
    written += 1;
  }

  io.stdout.write(
    `\n${written} artifact${written === 1 ? "" : "s"} applied` +
      (skipped > 0 ? `, ${skipped} skipped (tooling not detected)` : "") +
      ".\n",
  );
  return 0;
}

// ---------------------------------------------------------------------------
// Option parsers
// ---------------------------------------------------------------------------

type InspectOptionsResult2 =
  | { options: InspectOptions; success: true }
  | { message: string; success: false };

function parseInspectOptions(args: string[], options: CliOptions): InspectOptionsResult2 {
  const cwd = options.cwd ?? process.cwd();
  let projectDir = cwd;
  let profilesDir = options.profilesDir;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];

    if (flag === "--project") {
      const opt = parseStringValue("--project", value);
      if (!opt.success) return opt;
      projectDir = resolve(cwd, opt.value);
      index += 1;
      continue;
    }

    if (flag === "--profiles") {
      const opt = parseStringValue("--profiles", value);
      if (!opt.success) return opt;
      profilesDir = resolve(cwd, opt.value);
      index += 1;
      continue;
    }

    return { message: `Unknown argument: ${flag ?? ""}`, success: false };
  }

  return { options: { profilesDir, projectDir }, success: true };
}

type ServerOptions = { serverUrl: string };
type ServerOptionsResult =
  | { options: ServerOptions; success: true }
  | { message: string; success: false };

function parseServerOptions(args: string[], _options: CliOptions): ServerOptionsResult {
  let serverUrl = process.env["AC_SERVER_URL"] ?? "http://localhost:3000";

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];

    if (flag === "--server") {
      const opt = parseStringValue("--server", value);
      if (!opt.success) return opt;
      serverUrl = opt.value;
      index += 1;
      continue;
    }

    return { message: `Unknown argument: ${flag ?? ""}`, success: false };
  }

  return { options: { serverUrl }, success: true };
}

function parseStringValue(
  flag: string,
  value: string | undefined,
): { success: true; value: string } | { message: string; success: false } {
  if (value === undefined || value.trim() === "" || value.startsWith("--")) {
    return { message: `${flag} requires a value.`, success: false };
  }
  return { success: true, value };
}
