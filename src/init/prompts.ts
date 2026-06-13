import * as clack from "@clack/prompts";

import { knownTargetKeys } from "../model/effective-model.js";
import type { KnownTargetKey, ProfileMetadata } from "../model/effective-model.js";

import { InitError } from "./errors.js";

const projectNamePattern = /^[a-z][a-z0-9-]*$/;
const languagePattern = /^[a-z][a-z0-9-]*$/;
const defaultTargets: Partial<Record<KnownTargetKey, boolean>> = {
  agentsMd: true,
};

export type WizardOptions = {
  defaultProjectName: string;
  installedProfiles: string[];
  loadProfile: (profileName: string) => Promise<ProfileMetadata>;
  presetLanguages?: string[];
  presetProfileNames?: string[];
  presetProjectName?: string;
  presetTargetsExplicit: boolean;
};

export type WizardResult =
  | { cancelled: true }
  | {
      cancelled: false;
      disabledTargets: KnownTargetKey[];
      enabledTargets: KnownTargetKey[];
      languages: string[];
      profileMetadata: ProfileMetadata[];
      profileNames: string[];
      projectName: string;
    };

export async function runInitWizard(options: WizardOptions): Promise<WizardResult> {
  clack.intro("architect-companion init");

  const projectName = await promptProjectName(
    options.presetProjectName ?? options.defaultProjectName,
    options.presetProjectName !== undefined,
  );
  if (projectName === undefined) {
    return cancelled();
  }

  const profileNames = await promptProfileNames(
    options.installedProfiles,
    options.presetProfileNames,
  );
  if (profileNames === undefined) {
    return cancelled();
  }

  const profileMetadata = await Promise.all(
    profileNames.map((profileName) => options.loadProfile(profileName)),
  );

  const languages = await promptLanguages(profileNames, options.presetLanguages);
  if (languages === undefined) {
    return cancelled();
  }

  const targetSelection = await promptTargets(options.presetTargetsExplicit);
  if (targetSelection === undefined) {
    return cancelled();
  }

  const confirmed = await clack.confirm({
    initialValue: true,
    message: buildConfirmMessage({
      enabledTargets: targetSelection.enabled,
      languages,
      profileMetadata,
      projectName,
    }),
  });

  if (clack.isCancel(confirmed) || confirmed !== true) {
    clack.cancel("init cancelled.");
    return cancelled();
  }

  clack.outro("ready to initialize.");

  return {
    cancelled: false,
    disabledTargets: targetSelection.disabled,
    enabledTargets: targetSelection.enabled,
    languages,
    profileMetadata,
    profileNames,
    projectName,
  };
}

async function promptProjectName(
  initialValue: string,
  preset: boolean,
): Promise<string | undefined> {
  if (preset) {
    clack.note(`Project name: ${initialValue} (from --project-name)`);
    return initialValue;
  }

  const result = await clack.text({
    initialValue,
    message: "Project name",
    validate: (value: string | undefined) => {
      if (value === undefined || !projectNamePattern.test(value)) {
        return "Use lowercase letters, numbers, and hyphens, starting with a letter.";
      }
      return undefined;
    },
  });

  if (clack.isCancel(result)) {
    return undefined;
  }

  return result;
}

async function promptProfileNames(
  installedProfiles: string[],
  presets: string[] | undefined,
): Promise<string[] | undefined> {
  if (presets !== undefined && presets.length > 0) {
    const missing = presets.filter((preset) => !installedProfiles.includes(preset));
    if (missing.length > 0) {
      throw new InitError(
        `--profile ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not installed (installed: ${installedProfiles.length === 0 ? "none" : installedProfiles.join(", ")}).`,
      );
    }
    clack.note(`Profiles: ${presets.join(", ")} (from --profile)`);
    return presets;
  }

  if (installedProfiles.length === 0) {
    throw new InitError("No profiles installed.");
  }

  if (installedProfiles.length === 1) {
    const [only] = installedProfiles;
    if (only === undefined) {
      throw new InitError("No profiles installed.");
    }
    clack.note(`Profiles: ${only} (only installed profile)`);
    return [only];
  }

  const result = await clack.multiselect<string>({
    message: "Profiles",
    options: installedProfiles.map((name) => ({ label: name, value: name })),
    required: true,
  });

  if (clack.isCancel(result)) {
    return undefined;
  }

  return result;
}

async function promptLanguages(
  profileNames: string[],
  presets: string[] | undefined,
): Promise<string[] | undefined> {
  if (presets !== undefined && presets.length > 0) {
    clack.note(`Languages: ${presets.join(", ")} (from --language)`);
    return presets;
  }

  const initialValue = profileNames.includes("typescript") ? "typescript" : "";
  const result = await clack.text({
    initialValue,
    message: "Project languages",
    validate: (value: string | undefined) => {
      const languages = parseLanguageList(value);
      if (languages.length === 0) {
        return "Provide at least one language.";
      }
      const invalid = languages.find((language) => !languagePattern.test(language));
      if (invalid !== undefined) {
        return `${invalid} must use lowercase letters, numbers, and hyphens, starting with a letter.`;
      }
      return undefined;
    },
  });

  if (clack.isCancel(result)) {
    return undefined;
  }

  return parseLanguageList(result);
}

type TargetSelection = {
  disabled: KnownTargetKey[];
  enabled: KnownTargetKey[];
};

async function promptTargets(presetExplicit: boolean): Promise<TargetSelection | undefined> {
  if (presetExplicit) {
    clack.note("Targets: using values from --target / --no-target");
    return { disabled: [], enabled: [] };
  }

  const initialValues = knownTargetKeys.filter((target) => defaultTargets[target] === true);

  const result = await clack.multiselect<KnownTargetKey>({
    initialValues,
    message: "Enable targets",
    options: knownTargetKeys.map((target) => ({
      label: target,
      value: target,
    })),
    required: false,
  });

  if (clack.isCancel(result)) {
    return undefined;
  }

  const chosen = new Set<KnownTargetKey>(result);
  const enabled: KnownTargetKey[] = [];
  const disabled: KnownTargetKey[] = [];

  for (const target of knownTargetKeys) {
    const defaultValue = defaultTargets[target] === true;
    const isChosen = chosen.has(target);
    if (isChosen && !defaultValue) {
      enabled.push(target);
    } else if (!isChosen && defaultValue) {
      disabled.push(target);
    }
  }

  return { disabled, enabled };
}

function buildConfirmMessage(args: {
  enabledTargets: KnownTargetKey[];
  languages: string[];
  profileMetadata: ProfileMetadata[];
  projectName: string;
}): string {
  const profiles = args.profileMetadata
    .map((metadata) => `${metadata.profile.name}@${metadata.profile.version}`)
    .join(", ");
  const lines = [
    `Initialize ${args.projectName} with profiles ${profiles}`,
    `  Languages: ${args.languages.join(", ")}`,
    `  Enabled targets: ${args.enabledTargets.length === 0 ? "(none)" : args.enabledTargets.join(", ")}`,
  ];
  return lines.join("\n");
}

function parseLanguageList(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  const languages = value
    .split(",")
    .map((language) => language.trim())
    .filter((language) => language.length > 0);
  return Array.from(new Set(languages));
}

function cancelled(): { cancelled: true } {
  return { cancelled: true };
}
