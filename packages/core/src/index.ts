import { fileURLToPath } from "node:url";

export function defaultProfilesDir(): string {
  return fileURLToPath(new URL("../profiles", import.meta.url));
}

export type { EffectiveHarnessModel, ProfileMetadata } from "./model/effective-model.js";

export type { BuildModelOptions, HarnessReference } from "./model/effective-model.js";

export {
  HarnessConfigError,
  buildEffectiveHarnessModel,
  loadEffectiveHarnessModel,
  parseHarnessFromYaml,
  parseProfileFromYaml,
  serializeEffectiveHarnessModel,
} from "./model/effective-model.js";
