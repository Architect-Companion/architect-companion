import { access } from "node:fs/promises";
import path from "node:path";

import { getArchitectureCheckCommands } from "../checks/architecture-check-commands.js";
import { computeCapabilityWarnings, type CapabilityWarning } from "./capability-warnings.js";
import type { EffectiveHarnessModel } from "../model/effective-model.js";
import {
  describeProfileLockStaleReason,
  resolveProfileLockStatus,
  PROFILE_LOCK_FILE_PATH,
  type ProfileLockStatus,
} from "../model/profile-lock.js";

export type DoctorReport = {
  capabilityWarnings: CapabilityWarning[];
  missingTools: MissingTool[];
  profileLock: ProfileLockStatus;
};

export type MissingTool = {
  executable: string;
  hint: string;
  reason: string;
};

type RunDoctorOptions = {
  model: EffectiveHarnessModel;
  profilesDir: string;
  projectDir: string;
};

export async function runDoctor(options: RunDoctorOptions): Promise<DoctorReport> {
  const missingTools = await collectMissingTools(options);
  const capabilityWarnings = computeCapabilityWarnings(options.model);
  const profileLock = await resolveProfileLockStatus(options);

  return { capabilityWarnings, missingTools, profileLock };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];

  switch (report.profileLock.kind) {
    case "match":
      lines.push(`profile lock: matches ${formatProfileList(report.profileLock.lock.profiles)}.`);
      break;
    case "missing":
      lines.push(
        `profile lock: missing (${PROFILE_LOCK_FILE_PATH}). Run \`architect-companion render\` or \`architect-companion upgrade-profile\` to create it.`,
      );
      break;
    case "stale":
      lines.push(`profile lock: stale. ${describeProfileLockStaleReason(report.profileLock)}.`);
      lines.push("Run `architect-companion upgrade-profile` after reviewing the profile changes.");
      break;
  }

  if (report.missingTools.length === 0) {
    lines.push("tools: all required external tools are reachable.");
  } else {
    lines.push(`tools: ${report.missingTools.length} missing.`);
    for (const tool of report.missingTools) {
      lines.push(`  - ${tool.executable}: ${tool.reason}. ${tool.hint}`);
    }
  }

  if (report.capabilityWarnings.length === 0) {
    lines.push("capabilities: no warnings.");
  } else {
    lines.push(`capabilities: ${report.capabilityWarnings.length} warning(s).`);
    for (const warning of report.capabilityWarnings) {
      lines.push(`  - ${warning.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatProfileList(profiles: ProfileLockStatus["expected"]["profiles"]): string {
  return profiles.map((profile) => `${profile.name}@${profile.version}`).join(", ");
}

export function doctorReportHasIssues(report: DoctorReport): boolean {
  if (report.profileLock.kind === "stale") {
    return true;
  }

  return report.missingTools.length > 0;
}

async function collectMissingTools(options: RunDoctorOptions): Promise<MissingTool[]> {
  const missing: MissingTool[] = [];
  const requiredExecutables = collectRequiredExecutables(options.model);

  for (const executable of requiredExecutables) {
    const reachable = await isLocalNodeBinaryReachable(options.projectDir, executable);
    if (!reachable) {
      missing.push({
        executable,
        hint: `Add it to your project dev dependencies (for example: \`npm install --save-dev ${packageNameForExecutable(executable)}\`).`,
        reason: `not found in ${path.join("node_modules", ".bin", executable)}`,
      });
    }
  }

  return missing;
}

function collectRequiredExecutables(model: EffectiveHarnessModel): string[] {
  const executables = new Set<string>();
  for (const command of getArchitectureCheckCommands(model)) {
    if (command.id === "dependency-cruiser") {
      executables.add("depcruise");
    }
  }

  return Array.from(executables).sort((left, right) => left.localeCompare(right));
}

function packageNameForExecutable(executable: string): string {
  switch (executable) {
    case "depcruise":
      return "dependency-cruiser";
    default:
      return executable;
  }
}

async function isLocalNodeBinaryReachable(
  projectDir: string,
  executable: string,
): Promise<boolean> {
  const candidates = [
    path.join(projectDir, "node_modules", ".bin", executable),
    path.join(projectDir, "node_modules", ".bin", `${executable}.cmd`),
  ];

  for (const candidate of candidates) {
    if (await isAccessible(candidate)) {
      return true;
    }
  }

  return false;
}

async function isAccessible(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
