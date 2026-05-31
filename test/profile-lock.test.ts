import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadEffectiveHarnessModel } from "../src/model/effective-model.js";
import {
  PROFILE_LOCK_FILE_PATH,
  ProfileLockError,
  describeProfileLockStaleReason,
  formatProfileLock,
  resolveProfileLockStatus,
  writeProfileLock,
} from "../src/model/profile-lock.js";

const profilesDir = fileURLToPath(new URL("../profiles", import.meta.url));
const sampleProjectDir = fileURLToPath(new URL("fixtures/sample-project", import.meta.url));

describe("resolveProfileLockStatus", () => {
  it("returns missing when the lock file does not exist", async () => {
    const projectDir = copySampleProject();
    try {
      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      const status = await resolveProfileLockStatus({ model, profilesDir, projectDir });

      expect(status.kind).toBe("missing");
      expect(status.expected.profile.name).toBe("modular-monolith");
      expect(status.expected.profile.version).toBe("0.1.0");
      expect(status.expected.profile.contentHash).toMatch(/^sha256-[0-9a-f]{64}$/);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("returns match when the lock matches the resolved profile", async () => {
    const projectDir = copySampleProject();
    try {
      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      const initial = await resolveProfileLockStatus({ model, profilesDir, projectDir });
      await writeProfileLock(projectDir, initial.expected);

      const second = await resolveProfileLockStatus({ model, profilesDir, projectDir });

      expect(second.kind).toBe("match");
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("returns stale with different-content-hash when the profile content drifted", async () => {
    const projectDir = copySampleProject();
    try {
      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      const initial = await resolveProfileLockStatus({ model, profilesDir, projectDir });

      await writeProfileLock(projectDir, {
        ...initial.expected,
        profile: {
          ...initial.expected.profile,
          contentHash: "sha256-1111111111111111111111111111111111111111111111111111111111111111",
        },
      });

      const status = await resolveProfileLockStatus({ model, profilesDir, projectDir });

      expect(status.kind).toBe("stale");
      if (status.kind !== "stale") {
        throw new Error("expected stale lock status");
      }
      expect(status.reason).toBe("different-content-hash");
      expect(describeProfileLockStaleReason(status)).toContain("content has changed");
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("rejects invalid lock content with a helpful error", async () => {
    const projectDir = copySampleProject();
    try {
      writeFileSync(
        join(projectDir, PROFILE_LOCK_FILE_PATH),
        "schemaVersion: 1\nprofile: not-an-object\n",
      );

      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });

      await expect(resolveProfileLockStatus({ model, profilesDir, projectDir })).rejects.toThrow(
        ProfileLockError,
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("refuses to write the lock through a symlinked file", async () => {
    const projectDir = copySampleProject();
    const outsideDir = mkdtempSync(join(tmpdir(), "architect-companion-outside-"));
    const outsideFile = join(outsideDir, "profile.lock.yml");

    try {
      symlinkSync(outsideFile, join(projectDir, ".architect-companion/profile.lock.yml"));

      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      const status = await resolveProfileLockStatus({ model, profilesDir, projectDir }).catch(
        (error: unknown) => error,
      );

      expect(status).toBeInstanceOf(ProfileLockError);
      await expect(writeProfileLock(projectDir, defaultLock())).rejects.toThrow(
        /lock path contains a symbolic link/,
      );
      expect(existsSync(outsideFile)).toBe(false);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
      rmSync(outsideDir, { force: true, recursive: true });
    }
  });

  it("refuses to write through a symlinked parent directory", async () => {
    const projectDir = copySampleProject();
    const outsideDir = mkdtempSync(join(tmpdir(), "architect-companion-outside-"));

    try {
      rmSync(join(projectDir, ".architect-companion"), { force: true, recursive: true });
      symlinkSync(outsideDir, join(projectDir, ".architect-companion"), "dir");

      await expect(writeProfileLock(projectDir, defaultLock())).rejects.toThrow(
        /lock path contains a symbolic link/,
      );
      expect(existsSync(join(outsideDir, "profile.lock.yml"))).toBe(false);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
      rmSync(outsideDir, { force: true, recursive: true });
    }
  });

  it("rounds trips through formatProfileLock", async () => {
    const projectDir = copySampleProject();
    try {
      const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
      const status = await resolveProfileLockStatus({ model, profilesDir, projectDir });
      const serialized = formatProfileLock(status.expected);

      expect(serialized).toMatch(/^# Generated by Architect Companion/);
      expect(serialized).toContain("schemaVersion: 1");
      expect(serialized).toContain(status.expected.profile.contentHash);

      writeFileSync(join(projectDir, PROFILE_LOCK_FILE_PATH), serialized);
      const reread = await resolveProfileLockStatus({ model, profilesDir, projectDir });
      expect(reread.kind).toBe("match");
      expect(readFileSync(join(projectDir, PROFILE_LOCK_FILE_PATH), "utf8")).toBe(serialized);
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });
});

function copySampleProject(): string {
  const projectDir = mkdtempSync(join(tmpdir(), "architect-companion-profile-lock-"));
  cpSync(sampleProjectDir, projectDir, { recursive: true });
  return projectDir;
}

function defaultLock(): {
  profile: { contentHash: string; name: string; version: string };
  schemaVersion: 1;
} {
  return {
    profile: {
      contentHash: "sha256-0000000000000000000000000000000000000000000000000000000000000000",
      name: "modular-monolith",
      version: "0.1.0",
    },
    schemaVersion: 1,
  };
}
