import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { parseProfileFromYaml, type ProfileMetadata } from "@architect-companion/core";

const dataDir = resolve(process.env["AC_DATA_DIR"] ?? "./data");
const profilesDir = join(dataDir, "profiles");

export async function saveProfile(yamlContent: string): Promise<ProfileMetadata> {
  const metadata = parseProfileFromYaml(yamlContent);

  const profileDir = join(profilesDir, metadata.name, metadata.version);
  await mkdir(profileDir, { recursive: true });
  await writeFile(join(profileDir, "profile.yml"), yamlContent, "utf8");

  return metadata;
}

export async function findAllProfiles(): Promise<ProfileMetadata[]> {
  let names: string[];
  try {
    names = await readdir(profilesDir);
  } catch {
    return [];
  }

  const results: ProfileMetadata[] = [];

  for (const name of names) {
    let versions: string[];
    try {
      versions = await readdir(join(profilesDir, name));
    } catch {
      continue;
    }

    for (const version of versions) {
      try {
        const yaml = await readFile(join(profilesDir, name, version, "profile.yml"), "utf8");
        results.push(parseProfileFromYaml(yaml));
      } catch {
        // skip unreadable or invalid files
      }
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

export async function findProfile(name: string, version: string): Promise<string | undefined> {
  try {
    return await readFile(join(profilesDir, name, version, "profile.yml"), "utf8");
  } catch {
    return undefined;
  }
}
