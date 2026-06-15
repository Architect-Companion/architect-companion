import { fileURLToPath } from "node:url";

export function defaultProfilesDir(): string {
  return fileURLToPath(new URL("../../profiles", import.meta.url));
}
