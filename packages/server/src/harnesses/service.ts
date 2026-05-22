import type { HarnessConfig } from "./types.js";

// Implemented in Step 3
export async function findHarnessConfigByProjectId(
  _projectId: string,
): Promise<HarnessConfig | undefined> {
  return undefined;
}

export async function saveHarnessConfig(_config: Omit<HarnessConfig, "id" | "createdAt" | "updatedAt">): Promise<HarnessConfig> {
  throw new Error("Not implemented");
}
