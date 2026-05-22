import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const dataDir = resolve(process.env["AC_DATA_DIR"] ?? "./data");
const artifactsDir = join(dataDir, "artifacts");

async function listFilesRecursive(dir: string, prefix = ""): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursive(join(dir, entry.name), rel)));
    } else {
      results.push(rel);
    }
  }
  return results;
}

export async function listProjects(): Promise<{ files: string[]; name: string }[]> {
  let names: string[];
  try {
    names = await readdir(artifactsDir);
  } catch {
    return [];
  }

  const results: { files: string[]; name: string }[] = [];
  for (const name of names) {
    const files = await listFilesRecursive(join(artifactsDir, name));
    if (files.length > 0) {
      results.push({ name, files });
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readProjectFiles(
  projectName: string,
): Promise<Record<string, string> | undefined> {
  const projectDir = join(artifactsDir, projectName);
  const files = await listFilesRecursive(projectDir);

  if (files.length === 0) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const filePath of files) {
    try {
      result[filePath] = await readFile(join(projectDir, filePath), "utf8");
    } catch {
      // skip unreadable files
    }
  }

  return result;
}
