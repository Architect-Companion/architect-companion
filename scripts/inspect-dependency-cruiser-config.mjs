#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const helpText = `Inspect the generated dependency-cruiser config.

Usage:
  npm run inspect:dependency-cruiser
  npm run inspect:dependency-cruiser -- --project <dir> --profiles <dir>

Options:
  --project <dir>    Project directory containing .architect-companion/.
                     Defaults to test/fixtures/sample-project.
  --profiles <dir>   Profiles directory. Defaults to profiles/.
  -h, --help         Show this help message.
`;

const parsed = parseArgs(process.argv.slice(2));

if (parsed.help) {
  process.stdout.write(helpText);
  process.exitCode = 0;
} else {
  const [{ loadEffectiveHarnessModel }, { renderDependencyCruiserConfig }] = await Promise.all([
    import("../dist/model/effective-model.js"),
    import("../dist/integrations/dependency-cruiser.js"),
  ]);

  const model = await loadEffectiveHarnessModel({
    profilesDir: parsed.profilesDir,
    projectDir: parsed.projectDir,
  });

  process.stdout.write(renderDependencyCruiserConfig(model));
}

function parseArgs(args) {
  const options = {
    help: false,
    profilesDir: resolve(repoRoot, "profiles"),
    projectDir: resolve(repoRoot, "test/fixtures/sample-project"),
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];

    if (flag === "-h" || flag === "--help") {
      options.help = true;
      continue;
    }

    if (flag === "--project") {
      options.projectDir = parseDirectoryValue(flag, args[index + 1]);
      index += 1;
      continue;
    }

    if (flag === "--profiles") {
      options.profilesDir = parseDirectoryValue(flag, args[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${flag ?? ""}`);
  }

  return options;
}

function parseDirectoryValue(flag, value) {
  if (value === undefined || value.trim() === "" || value.startsWith("--")) {
    throw new Error(`${flag} requires a directory.`);
  }

  return resolve(process.cwd(), value);
}
