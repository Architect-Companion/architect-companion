#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
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
  architect-companion init [--server <url>]
  architect-companion render [--server <url>]
  architect-companion pull [--server <url>]
  architect-companion inspect effective-model [--project <dir>] [--profiles <dir>]

Options:
  -h, --help          Show this help message.
  -v, --version       Show the Architect Companion version.

Commands:
  init [--server <url>]
      Interactive setup wizard. Fetches available profiles from the server,
      asks which agents and CI targets to enable, and creates
      .architect-companion/harness.yml plus a scaffold modules.yml.

  render [--server <url>]
      Read .architect-companion/harness.yml, call the render API, and
      apply all artifacts to the project in one step.

  pull [--server <url>]
      Re-apply the last rendered artifacts without re-rendering.
      Useful to sync after another team member ran render.

  inspect effective-model [--project <dir>] [--profiles <dir>]
      Validate harness inputs and print the resolved effective model as JSON.

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
    if (existsSync(join(current, ".git"))) return current;
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
  return {
    hasClaudeCode:
      existsSync(join(projectDir, ".claude")) || existsSync(join(projectDir, "CLAUDE.md")),
    hasCursor: existsSync(join(projectDir, ".cursor")),
    hasGithub: existsSync(join(projectDir, ".github")) || (remoteUrl?.includes("github.com") ?? false),
  };
}

function envSummary(env: DetectedEnv): string {
  const parts = [
    env.hasGithub ? "GitHub Actions" : null,
    env.hasClaudeCode ? "Claude Code" : null,
    env.hasCursor ? "Cursor" : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(", ") : "none detected";
}

function routeArtifact(artifactPath: string, env: DetectedEnv): string | null {
  if (artifactPath.startsWith(".github/")) return env.hasGithub ? artifactPath : null;
  if (artifactPath.startsWith(".cursor/")) return env.hasCursor ? artifactPath : null;
  if (artifactPath.startsWith(".claude/")) return env.hasClaudeCode ? artifactPath : null;
  return artifactPath;
}

// ---------------------------------------------------------------------------
// Interactive prompt helpers
// ---------------------------------------------------------------------------

async function ask(prompt: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

async function pickOne<T>(
  io: CliIo,
  prompt: string,
  options: { hint?: string; label: string; value: T }[],
  defaultIndex = 0,
): Promise<T> {
  io.stdout.write(`\n${prompt}\n`);
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const hint = opt?.hint !== undefined ? `  — ${opt.hint}` : "";
    io.stdout.write(`  ${i + 1}) ${opt?.label ?? ""}${hint}\n`);
  }

  const answer = await ask(`\n  Choice [${defaultIndex + 1}]: `);
  const raw = answer === "" ? defaultIndex : parseInt(answer, 10) - 1;

  if (isNaN(raw) || raw < 0 || raw >= options.length) {
    io.stderr.write(`Invalid choice "${answer}", using default.\n`);
    return options[defaultIndex]!.value;
  }
  return options[raw]!.value;
}

async function pickMany<T>(
  io: CliIo,
  prompt: string,
  options: { default: boolean; hint?: string; label: string; value: T }[],
): Promise<T[]> {
  io.stdout.write(`\n${prompt}\n`);
  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    const mark = opt.default ? "*" : " ";
    const hint = opt.hint !== undefined ? `  — ${opt.hint}` : "";
    io.stdout.write(`  ${i + 1}) [${mark}] ${opt.label}${hint}\n`);
  }

  const defaults = options
    .map((opt, i) => (opt.default ? String(i + 1) : null))
    .filter((s): s is string => s !== null)
    .join(",");

  const answer = await ask(`\n  Choices [${defaults || "none"}]: `);

  if (answer === "") {
    return options.filter((o) => o.default).map((o) => o.value);
  }

  const indices = answer
    .split(",")
    .map((s) => parseInt(s.trim(), 10) - 1)
    .filter((i) => i >= 0 && i < options.length);

  return indices.map((i) => options[i]!.value);
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
  if (firstArg === "render") return runRenderCommand(args.slice(1), io, options);
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
// init — interactive setup wizard
// ---------------------------------------------------------------------------

type ProfileMeta = {
  name: string;
  summary?: string;
  title?: string;
  version: string;
};

type TargetKey = "agentsMd" | "cursor" | "dependencyCruiser" | "githubActions";

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
  const env = detectEnv(gitRoot, gitRoot);

  io.stdout.write("Architect Companion Setup\n");
  io.stdout.write("─────────────────────────\n");
  io.stdout.write(`Project:  ${projectName}  (from git remote)\n`);
  io.stdout.write(`Detected: ${envSummary(env)}\n`);

  // Check for existing harness
  const harnessDir = join(gitRoot, ".architect-companion");
  const harnessPath = join(harnessDir, "harness.yml");
  if (existsSync(harnessPath)) {
    const overwrite = await ask("\n.architect-companion/harness.yml already exists. Overwrite? [y/N]: ");
    if (overwrite.toLowerCase() !== "y") {
      io.stdout.write("Aborted.\n");
      return 0;
    }
  }

  // Fetch profiles from server
  io.stdout.write(`\nFetching profiles from ${serverUrl}…\n`);
  let profiles: ProfileMeta[];
  try {
    const res = await fetch(`${serverUrl}/api/profiles`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    profiles = (await res.json()) as ProfileMeta[];
  } catch {
    io.stderr.write(
      `Could not reach server at ${serverUrl}.\n` +
        `Upload at least one profile via the UI, then run init again.\n`,
    );
    return 1;
  }

  if (profiles.length === 0) {
    io.stderr.write(
      "No profiles found on the server.\n" +
        `Open ${serverUrl.replace(":3000", ":3001")} and upload a profile first.\n`,
    );
    return 1;
  }

  // 1 — Profile
  const selectedProfile = await pickOne(
    io,
    "Architecture profile:",
    profiles.map((p) => {
      const option: { hint?: string; label: string; value: ProfileMeta } = {
        label: `${p.title ?? p.name}  (${p.name} v${p.version})`,
        value: p,
      };
      if (p.summary !== undefined) option.hint = p.summary;
      return option;
    }),
    0,
  );

  // 2 — Stack (only typescript supported today; show as info if profile has a default)
  io.stdout.write("\nStack: typescript  (only supported stack)\n");
  const stack = "typescript";

  // 3 — Targets
  const selectedTargets = await pickMany<TargetKey>(
    io,
    "Generate artifacts for:",
    [
      {
        label: "AGENTS.md",
        hint: "AI agent instructions (all agents)",
        value: "agentsMd",
        default: true,
      },
      {
        label: "Dependency Cruiser config",
        hint: "enforces module boundary rules",
        value: "dependencyCruiser",
        default: true,
      },
      {
        label: "Cursor rules  (.cursor/rules/)",
        hint: env.hasCursor ? "detected" : "enable if using Cursor IDE",
        value: "cursor",
        default: env.hasCursor,
      },
      {
        label: "GitHub Actions check workflow",
        hint: env.hasGithub ? "github.com remote detected" : "enable if using GitHub",
        value: "githubActions",
        default: env.hasGithub,
      },
    ],
  );

  const targets: Partial<Record<TargetKey, boolean>> = {
    agentsMd: selectedTargets.includes("agentsMd"),
    dependencyCruiser: selectedTargets.includes("dependencyCruiser"),
    cursor: selectedTargets.includes("cursor"),
    githubActions: selectedTargets.includes("githubActions"),
  };

  // Write harness.yml
  const harnessYaml = buildHarnessYaml(selectedProfile, stack, targets);
  await mkdir(join(harnessDir, "architecture"), { recursive: true });
  await writeFile(harnessPath, harnessYaml, "utf8");
  io.stdout.write("\n  wrote  .architect-companion/harness.yml\n");

  // Write scaffold modules.yml if not present
  const modulesPath = join(harnessDir, "architecture", "modules.yml");
  if (!existsSync(modulesPath)) {
    await writeFile(modulesPath, scaffoldModulesYml(), "utf8");
    io.stdout.write("  wrote  .architect-companion/architecture/modules.yml\n");
  }

  io.stdout.write(`
Setup complete. Next steps:
  1. Edit .architect-companion/architecture/modules.yml to describe your modules.
  2. Run \`architect-companion render\` to generate and apply architecture artifacts.
`);

  return 0;
}

function buildHarnessYaml(
  profile: ProfileMeta,
  stack: string,
  targets: Partial<Record<TargetKey, boolean>>,
): string {
  const targetLines = (Object.entries(targets) as [TargetKey, boolean][])
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

  return `schemaVersion: 1
profile:
  name: ${profile.name}
  version: ${profile.version}
project:
  name: derived-from-git-remote
stack: ${stack}
modules: architecture/modules.yml
targets:
${targetLines}
`;
}

function scaffoldModulesYml(): string {
  return `schemaVersion: 1
modules:
  - name: example
    path: src/example
    public_api: src/example/index.ts
# Add your modules here. Each module needs a name, a path, and a public_api entry point.
# allowed_dependencies:
#   example: []
`;
}

// ---------------------------------------------------------------------------
// render — call server render API + apply artifacts
// ---------------------------------------------------------------------------

async function runRenderCommand(args: string[], io: CliIo, options: CliOptions): Promise<number> {
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
    io.stderr.write("No git repository found. Run render from within a git project.\n");
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
      `No .architect-companion/harness.yml found.\nRun \`architect-companion init\` first.\n`,
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

  let renderResponse: Response;
  try {
    renderResponse = await fetch(`${serverUrl}/api/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    io.stderr.write(`Could not reach server at ${serverUrl}. Is it running?\n`);
    return 1;
  }

  const renderData = (await renderResponse.json()) as {
    files?: Record<string, string>;
    error?: string;
  };

  if (!renderResponse.ok) {
    io.stderr.write(`Render failed: ${renderData.error ?? "unknown error"}\n`);
    return 1;
  }

  // Apply artifacts immediately after rendering
  const env = detectEnv(gitRoot, gitRoot);
  io.stdout.write(`Detected: ${envSummary(env)}\n\n`);

  const files = renderData.files ?? {};
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
// pull — apply last rendered artifacts from server
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
  io.stdout.write(`Detected: ${envSummary(env)}\n\n`);

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
        `Run \`architect-companion render\` first.\n`,
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
// Option parsers
// ---------------------------------------------------------------------------

function parseInspectOptions(args: string[], options: CliOptions): InspectOptionsResult {
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
