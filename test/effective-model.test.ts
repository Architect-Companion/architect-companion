import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  HarnessConfigError,
  loadEffectiveHarnessModel,
  serializeEffectiveHarnessModel,
} from "../src/model/effective-model.js";

const profilesDir = fileURLToPath(new URL("../profiles", import.meta.url));
const sampleProjectDir = fileURLToPath(new URL("fixtures/sample-project", import.meta.url));

describe("loadEffectiveHarnessModel", () => {
  it("loads a stable effective model from profile and project config", async () => {
    const model = await loadEffectiveHarnessModel({
      profilesDir,
      projectDir: sampleProjectDir,
    });

    expect(serializeEffectiveHarnessModel(model)).toBe(`{
  "allowedDependencies": {
    "billing": [
      "identity"
    ]
  },
  "modules": [
    {
      "name": "billing",
      "path": "src/modules/billing",
      "publicApi": "src/modules/billing/index.ts"
    },
    {
      "name": "identity",
      "path": "src/modules/identity",
      "publicApi": "src/modules/identity/index.ts"
    }
  ],
  "policies": [],
  "profile": {
    "name": "modular-monolith",
    "summary": "Opinionated guidance for TypeScript modular monoliths.",
    "title": "Modular Monolith",
    "version": "0.1.0"
  },
  "project": {
    "name": "sample-project"
  },
  "schemaVersion": 1,
  "stack": "typescript",
  "targets": {
    "agentsMd": true,
    "cursor": false,
    "dependencyCruiser": true,
    "githubActions": false
  }
}
`);
  });

  it("produces deterministic output across repeated loads", async () => {
    const first = await loadEffectiveHarnessModel({
      profilesDir,
      projectDir: sampleProjectDir,
    });
    const second = await loadEffectiveHarnessModel({
      profilesDir,
      projectDir: sampleProjectDir,
    });

    expect(serializeEffectiveHarnessModel(first)).toBe(serializeEffectiveHarnessModel(second));
  });

  it("fails when the harness file is missing", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "architect-companion-empty-"));

    try {
      await expect(loadEffectiveHarnessModel({ profilesDir, projectDir })).rejects.toThrow(
        /harness\.yml: file not found\./,
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("fails when the profile version does not match", async () => {
    const projectDir = copySampleProject();
    writeFileSync(
      join(projectDir, ".architect-companion", "harness.yml"),
      `schemaVersion: 1
profile:
  name: modular-monolith
  version: 9.9.9
project:
  name: sample-project
modules: architecture/modules.yml
`,
    );

    try {
      await expect(loadEffectiveHarnessModel({ profilesDir, projectDir })).rejects.toThrow(
        /profile\.version "9\.9\.9" does not match/,
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("fails when the schema version is unsupported", async () => {
    const projectDir = copySampleProject();
    writeFileSync(
      join(projectDir, ".architect-companion", "harness.yml"),
      `schemaVersion: 2
profile:
  name: modular-monolith
  version: 0.1.0
project:
  name: sample-project
modules: architecture/modules.yml
`,
    );

    try {
      await expect(loadEffectiveHarnessModel({ profilesDir, projectDir })).rejects.toThrow(
        /schemaVersion must be 1/,
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("fails when the project name is not an identifier", async () => {
    const projectDir = copySampleProject();
    writeFileSync(
      join(projectDir, ".architect-companion", "harness.yml"),
      `schemaVersion: 1
profile:
  name: modular-monolith
  version: 0.1.0
project:
  name: My Project
modules: architecture/modules.yml
`,
    );

    try {
      await expect(loadEffectiveHarnessModel({ profilesDir, projectDir })).rejects.toThrow(
        /project\.name must use lowercase letters/,
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("fails when module names are duplicated", async () => {
    const projectDir = copySampleProject();
    writeFileSync(
      join(projectDir, ".architect-companion", "architecture", "modules.yml"),
      `schemaVersion: 1
modules:
  - name: billing
    path: src/modules/billing
    public_api: src/modules/billing/index.ts
  - name: billing
    path: src/modules/billing-copy
    public_api: src/modules/billing-copy/index.ts
`,
    );

    try {
      await expect(loadEffectiveHarnessModel({ profilesDir, projectDir })).rejects.toThrow(
        /duplicates module "billing"/,
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("fails when allowed dependencies reference an unknown module", async () => {
    const projectDir = copySampleProject();
    writeFileSync(
      join(projectDir, ".architect-companion", "architecture", "modules.yml"),
      `schemaVersion: 1
modules:
  - name: billing
    path: src/modules/billing
    public_api: src/modules/billing/index.ts
allowed_dependencies:
  billing:
    - identity
`,
    );

    try {
      await expect(loadEffectiveHarnessModel({ profilesDir, projectDir })).rejects.toThrow(
        /allowed_dependencies\.billing\[0\] references unknown module "identity"/,
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("fails for invalid YAML", async () => {
    const projectDir = copySampleProject();
    writeFileSync(join(projectDir, ".architect-companion", "harness.yml"), "schemaVersion: [\n");

    try {
      await expect(loadEffectiveHarnessModel({ profilesDir, projectDir })).rejects.toThrow(
        HarnessConfigError,
      );
      await expect(loadEffectiveHarnessModel({ profilesDir, projectDir })).rejects.toThrow(
        /invalid YAML/,
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it("fails for unknown fields", async () => {
    const projectDir = copySampleProject();
    writeFileSync(
      join(projectDir, ".architect-companion", "harness.yml"),
      `schemaVersion: 1
profile:
  name: modular-monolith
  version: 0.1.0
project:
  name: sample-project
modules: architecture/modules.yml
unexpected: true
`,
    );

    try {
      await expect(loadEffectiveHarnessModel({ profilesDir, projectDir })).rejects.toThrow(
        /unexpected is not supported/,
      );
    } finally {
      rmSync(projectDir, { force: true, recursive: true });
    }
  });
});

function copySampleProject(): string {
  const projectDir = mkdtempSync(join(tmpdir(), "architect-companion-project-"));
  cpSync(sampleProjectDir, projectDir, { recursive: true });
  return projectDir;
}
