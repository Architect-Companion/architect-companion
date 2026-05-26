import { lstat } from "node:fs/promises";
import path from "node:path";

export async function findSymlinkedSegment(
  projectDir: string,
  absolutePath: string,
): Promise<string | undefined> {
  const relativePath = path.relative(projectDir, absolutePath);
  const segments = relativePath.split(path.sep).filter((segment) => segment.length > 0);
  let currentPath = projectDir;

  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    const stats = await lstatOptional(currentPath);

    if (stats === undefined) {
      return undefined;
    }

    if (stats.isSymbolicLink()) {
      return currentPath;
    }
  }

  return undefined;
}

async function lstatOptional(
  filePath: string,
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(filePath);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
