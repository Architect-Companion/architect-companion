import * as clack from "@clack/prompts";

import { knownTargetKeys, supportedStacks } from "../model/effective-model.js";
import type { KnownTargetKey, ProfileMetadata, SupportedStack } from "../model/effective-model.js";

import { InitError } from "./errors.js";

const projectNamePattern = /^[a-z][a-z0-9-]*$/;

export type WizardOptions = {
  defaultProjectName: string;
  installedProfiles: string[];
  loadProfile: (profileName: string) => Promise<ProfileMetadata>;
  presetProfileName?: string;
  presetProjectName?: string;
  presetStack?: SupportedStack;
  presetTargetsExplicit: boolean;
};

export type WizardResult =
  | { cancelled: true }
  | {
      cancelled: false;
      disabledTargets: KnownTargetKey[];
      enabledTargets: KnownTargetKey[];
      profileMetadata: ProfileMetadata;
      profileName: string;
      projectName: string;
      stack?: SupportedStack;
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

  const profileName = await promptProfileName(options.installedProfiles, options.presetProfileName);
  if (profileName === undefined) {
    return cancelled();
  }

  const profileMetadata = await options.loadProfile(profileName);

  const stackOutcome = await promptStack(profileMetadata, options.presetStack);
  if (stackOutcome.kind === "cancelled") {
    return cancelled();
  }

  const targetSelection = await promptTargets(profileMetadata, options.presetTargetsExplicit);
  if (targetSelection === undefined) {
    return cancelled();
  }

  const confirmed = await clack.confirm({
    initialValue: true,
    message: buildConfirmMessage({
      profileMetadata,
      projectName,
      stack: stackOutcome.stack,
      enabledTargets: targetSelection.enabled,
    }),
  });

  if (clack.isCancel(confirmed) || confirmed !== true) {
    clack.cancel("init cancelled.");
    return cancelled();
  }

  clack.outro("ready to initialize.");

  const result: WizardResult = {
    cancelled: false,
    disabledTargets: targetSelection.disabled,
    enabledTargets: targetSelection.enabled,
    profileMetadata,
    profileName,
    projectName,
  };
  if (stackOutcome.explicit) {
    result.stack = stackOutcome.stack;
  }
  return result;
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
    validate: (value) => {
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

async function promptProfileName(
  installedProfiles: string[],
  preset: string | undefined,
): Promise<string | undefined> {
  if (preset !== undefined) {
    if (!installedProfiles.includes(preset)) {
      throw new InitError(
        `--profile ${preset} is not installed (installed: ${installedProfiles.length === 0 ? "none" : installedProfiles.join(", ")}).`,
      );
    }
    clack.note(`Profile: ${preset} (from --profile)`);
    return preset;
  }

  if (installedProfiles.length === 0) {
    throw new InitError("No profiles installed.");
  }

  if (installedProfiles.length === 1) {
    const [only] = installedProfiles;
    if (only === undefined) {
      throw new InitError("No profiles installed.");
    }
    clack.note(`Profile: ${only} (only installed profile)`);
    return only;
  }

  const result = await clack.select<string>({
    message: "Profile",
    options: installedProfiles.map((name) => ({ label: name, value: name })),
  });

  if (clack.isCancel(result)) {
    return undefined;
  }

  return result;
}

type StackOutcome =
  | { kind: "cancelled" }
  | { explicit: boolean; kind: "resolved"; stack: SupportedStack };

async function promptStack(
  profileMetadata: ProfileMetadata,
  preset: SupportedStack | undefined,
): Promise<StackOutcome> {
  const profileStack = profileMetadata.defaults.stack;

  if (preset !== undefined) {
    if (profileStack !== undefined && profileStack !== preset) {
      throw new InitError(
        `--stack ${preset} is not supported by profile ${profileMetadata.profile.name}@${profileMetadata.profile.version} (supports: ${profileStack}).`,
      );
    }
    clack.note(`Stack: ${preset} (from --stack)`);
    return { explicit: true, kind: "resolved", stack: preset };
  }

  if (profileStack !== undefined) {
    clack.note(`Stack: ${profileStack} (profile default)`);
    return { explicit: false, kind: "resolved", stack: profileStack };
  }

  const result = await clack.select<SupportedStack>({
    message: "Stack",
    options: supportedStacks.map((stack) => ({ label: stack, value: stack })),
  });

  if (clack.isCancel(result)) {
    return { kind: "cancelled" };
  }

  return { explicit: true, kind: "resolved", stack: result };
}

type TargetSelection = {
  disabled: KnownTargetKey[];
  enabled: KnownTargetKey[];
};

async function promptTargets(
  profileMetadata: ProfileMetadata,
  presetExplicit: boolean,
): Promise<TargetSelection | undefined> {
  if (presetExplicit) {
    clack.note("Targets: using values from --target / --no-target");
    return { disabled: [], enabled: [] };
  }

  const defaults = profileMetadata.defaults.targets;
  const initialValues = knownTargetKeys.filter((target) => defaults[target] === true);

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
    const profileDefault = defaults[target] === true;
    const isChosen = chosen.has(target);
    if (isChosen && !profileDefault) {
      enabled.push(target);
    } else if (!isChosen && profileDefault) {
      disabled.push(target);
    }
  }

  return { disabled, enabled };
}

function buildConfirmMessage(args: {
  enabledTargets: KnownTargetKey[];
  profileMetadata: ProfileMetadata;
  projectName: string;
  stack: SupportedStack | undefined;
}): string {
  const lines = [
    `Initialize ${args.projectName} with profile ${args.profileMetadata.profile.name}@${args.profileMetadata.profile.version}`,
    `  Stack: ${args.stack ?? "(none)"}`,
    `  Enabled targets: ${args.enabledTargets.length === 0 ? "(none)" : args.enabledTargets.join(", ")}`,
  ];
  return lines.join("\n");
}

function cancelled(): { cancelled: true } {
  return { cancelled: true };
}
