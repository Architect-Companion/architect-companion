export {
  runDoctor,
  formatDoctorReport,
  doctorReportHasIssues,
  type DoctorReport,
  type MissingTool,
  type RunDoctorOptions,
} from "./diagnostics/doctor.js";

export { InitError, runInit, type InitInputs, type InitIo } from "./init/init.js";

export { defaultProfilesDir } from "./io/profiles-dir.js";

export {
  HarnessConfigError,
  loadEffectiveHarnessModel,
  serializeEffectiveHarnessModel,
  type EffectiveHarnessModel,
  type ProfileMetadata,
  type ProfileReference,
} from "./model/effective-model.js";

export {
  ProfileLockError,
  resolveProfileLockStatus,
  writeProfileLock,
  PROFILE_LOCK_FILE_PATH,
  type LockedProfile,
  type ProfileLock,
  type ProfileLockStatus,
  type ProfileLockStaleReason,
  type ResolveProfileLockOptions,
} from "./model/profile-lock.js";

export {
  RenderError,
  renderEffectiveHarnessModel,
  type RenderOptions,
  type RenderResult,
} from "./render/render.js";
