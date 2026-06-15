import { describe, expect, it } from "vitest";

import {
  defaultProfilesDir,
  doctorReportHasIssues,
  formatDoctorReport,
  HarnessConfigError,
  InitError,
  loadEffectiveHarnessModel,
  PROFILE_LOCK_FILE_PATH,
  ProfileLockError,
  renderEffectiveHarnessModel,
  RenderError,
  resolveProfileLockStatus,
  runDoctor,
  runInit,
  serializeEffectiveHarnessModel,
  writeProfileLock,
} from "../src/index.js";

describe("public API exports", () => {
  it("exports all CLI-command functions", () => {
    expect(typeof runInit).toBe("function");
    expect(typeof loadEffectiveHarnessModel).toBe("function");
    expect(typeof serializeEffectiveHarnessModel).toBe("function");
    expect(typeof renderEffectiveHarnessModel).toBe("function");
    expect(typeof runDoctor).toBe("function");
    expect(typeof formatDoctorReport).toBe("function");
    expect(typeof doctorReportHasIssues).toBe("function");
    expect(typeof resolveProfileLockStatus).toBe("function");
    expect(typeof writeProfileLock).toBe("function");
  });

  it("exports defaultProfilesDir returning a non-empty string", () => {
    expect(typeof defaultProfilesDir).toBe("function");
    const dir = defaultProfilesDir();
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });

  it("exports all domain error classes", () => {
    expect(new HarnessConfigError("x")).toBeInstanceOf(Error);
    expect(new InitError("x")).toBeInstanceOf(Error);
    expect(new ProfileLockError("x")).toBeInstanceOf(Error);
    expect(new RenderError("x")).toBeInstanceOf(Error);
  });

  it("exports PROFILE_LOCK_FILE_PATH constant", () => {
    expect(typeof PROFILE_LOCK_FILE_PATH).toBe("string");
    expect(PROFILE_LOCK_FILE_PATH.length).toBeGreaterThan(0);
  });
});
