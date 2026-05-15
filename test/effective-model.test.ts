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
  "examples": [
    {
      "bad": "import { loadCustomerRow } from \\"../identity/internal/customer-repository\\";\\n\\nconst customer = await loadCustomerRow(customerId);",
      "good": "import { findCustomer } from \\"../identity\\";\\n\\nconst customer = await findCustomer(customerId);",
      "id": "module-access",
      "title": "Module access"
    }
  ],
  "heuristics": [
    {
      "id": "architecture-review",
      "questions": [
        "Does the change introduce a new dependency between modules?",
        "Does every cross-module call use the target module's public API?",
        "Is shared behavior placed in a stable module instead of duplicated through internal imports?",
        "Would a future module extraction be harder after this change?"
      ],
      "title": "Architecture review"
    }
  ],
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
  "policies": [
    {
      "guidance": "Cross-module imports should target the public_api path declared for the dependency module. Imports from another module's internal files are boundary violations unless the dependency is redesigned or a documented exception is introduced.",
      "id": "module-boundaries",
      "implementation": {
        "typescript": {
          "engine": "dependency-cruiser",
          "renderer": "dependency-cruiser-config"
        }
      },
      "intent": "Modules may import another module only through its public API.",
      "severity": "error",
      "title": "Module boundaries"
    }
  ],
  "principles": [
    {
      "guidance": "Treat each module as the owner of its business behavior, data access, and invariants. Other modules should depend on the module's public API instead of reaching into its internal files.",
      "id": "module-ownership",
      "title": "Modules own behavior behind public APIs"
    }
  ],
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
  },
  "workflows": [
    {
      "id": "change-module-boundary",
      "steps": [
        "Identify the modules affected by the proposed boundary change.",
        "Decide whether the change belongs in a public API or inside one module.",
        "Update the public API before changing consumers.",
        "Remove cross-module internal imports introduced during the change.",
        "Run the architecture boundary check once rendering and checks are available."
      ],
      "title": "Change a module boundary"
    }
  ]
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

  it("fails for unknown fields in profile guidance sections", async () => {
    const tempProfilesDir = copyProfiles();
    writeProfile(
      tempProfilesDir,
      profileYaml(`principles:
  - id: module-ownership
    title: Module ownership
    guidance: Keep module behavior behind public APIs.
    unexpected: true
policies: []
workflows: []
heuristics: []
examples: []
`),
    );

    try {
      await expect(
        loadEffectiveHarnessModel({ profilesDir: tempProfilesDir, projectDir: sampleProjectDir }),
      ).rejects.toThrow(/principles\[0\]\.unexpected is not supported/);
    } finally {
      rmSync(tempProfilesDir, { force: true, recursive: true });
    }
  });

  it("fails when required profile guidance strings are empty", async () => {
    const tempProfilesDir = copyProfiles();
    writeProfile(
      tempProfilesDir,
      profileYaml(`principles:
  - id: module-ownership
    title: ""
    guidance: Keep module behavior behind public APIs.
policies: []
workflows: []
heuristics: []
examples: []
`),
    );

    try {
      await expect(
        loadEffectiveHarnessModel({ profilesDir: tempProfilesDir, projectDir: sampleProjectDir }),
      ).rejects.toThrow(/principles\[0\]\.title must be a non-empty string/);
    } finally {
      rmSync(tempProfilesDir, { force: true, recursive: true });
    }
  });

  it("fails for invalid policy severity", async () => {
    const tempProfilesDir = copyProfiles();
    writeProfile(
      tempProfilesDir,
      profileYaml(`principles: []
policies:
  - id: module-boundaries
    title: Module boundaries
    intent: Modules import through public APIs.
    severity: critical
    guidance: Keep cross-module imports on public APIs.
workflows: []
heuristics: []
examples: []
`),
    );

    try {
      await expect(
        loadEffectiveHarnessModel({ profilesDir: tempProfilesDir, projectDir: sampleProjectDir }),
      ).rejects.toThrow(/policies\[0\]\.severity must be one of: advisory, warning, error/);
    } finally {
      rmSync(tempProfilesDir, { force: true, recursive: true });
    }
  });

  it("fails when policy severity is missing", async () => {
    const tempProfilesDir = copyProfiles();
    writeProfile(
      tempProfilesDir,
      profileYaml(`principles: []
policies:
  - id: module-boundaries
    title: Module boundaries
    intent: Modules import through public APIs.
    guidance: Keep cross-module imports on public APIs.
workflows: []
heuristics: []
examples: []
`),
    );

    try {
      await expect(
        loadEffectiveHarnessModel({ profilesDir: tempProfilesDir, projectDir: sampleProjectDir }),
      ).rejects.toThrow(/policies\[0\]\.severity must be a non-empty string/);
    } finally {
      rmSync(tempProfilesDir, { force: true, recursive: true });
    }
  });

  it("fails for invalid policy implementation metadata", async () => {
    const tempProfilesDir = copyProfiles();
    writeProfile(
      tempProfilesDir,
      profileYaml(`principles: []
policies:
  - id: module-boundaries
    title: Module boundaries
    intent: Modules import through public APIs.
    severity: error
    guidance: Keep cross-module imports on public APIs.
    implementation:
      typescript:
        engine: custom-analyzer
        renderer: dependency-cruiser-config
workflows: []
heuristics: []
examples: []
`),
    );

    try {
      await expect(
        loadEffectiveHarnessModel({ profilesDir: tempProfilesDir, projectDir: sampleProjectDir }),
      ).rejects.toThrow(/implementation\.typescript\.engine must be one of: dependency-cruiser/);
    } finally {
      rmSync(tempProfilesDir, { force: true, recursive: true });
    }
  });

  it("omits empty policy implementation metadata", async () => {
    const tempProfilesDir = copyProfiles();
    writeProfile(
      tempProfilesDir,
      profileYaml(`principles: []
policies:
  - id: module-boundaries
    title: Module boundaries
    intent: Modules import through public APIs.
    severity: error
    guidance: Keep cross-module imports on public APIs.
    implementation: {}
workflows: []
heuristics: []
examples: []
`),
    );

    try {
      const model = await loadEffectiveHarnessModel({
        profilesDir: tempProfilesDir,
        projectDir: sampleProjectDir,
      });

      expect(model.policies).toHaveLength(1);
      expect(model.policies[0]?.implementation).toBeUndefined();
      expect(serializeEffectiveHarnessModel(model)).not.toContain('"implementation": {}');
    } finally {
      rmSync(tempProfilesDir, { force: true, recursive: true });
    }
  });

  it("fails when workflow steps are not an array", async () => {
    const tempProfilesDir = copyProfiles();
    writeProfile(
      tempProfilesDir,
      profileYaml(`principles: []
policies: []
workflows:
  - id: change-module-boundary
    title: Change module boundary
    steps: Run the check.
heuristics: []
examples: []
`),
    );

    try {
      await expect(
        loadEffectiveHarnessModel({ profilesDir: tempProfilesDir, projectDir: sampleProjectDir }),
      ).rejects.toThrow(/workflows\[0\]\.steps must be an array/);
    } finally {
      rmSync(tempProfilesDir, { force: true, recursive: true });
    }
  });

  it("fails when workflow steps are empty", async () => {
    const tempProfilesDir = copyProfiles();
    writeProfile(
      tempProfilesDir,
      profileYaml(`principles: []
policies: []
workflows:
  - id: change-module-boundary
    title: Change module boundary
    steps: []
heuristics: []
examples: []
`),
    );

    try {
      await expect(
        loadEffectiveHarnessModel({ profilesDir: tempProfilesDir, projectDir: sampleProjectDir }),
      ).rejects.toThrow(/workflows\[0\]\.steps must include at least one item/);
    } finally {
      rmSync(tempProfilesDir, { force: true, recursive: true });
    }
  });

  it("fails when heuristic questions are not an array", async () => {
    const tempProfilesDir = copyProfiles();
    writeProfile(
      tempProfilesDir,
      profileYaml(`principles: []
policies: []
workflows: []
heuristics:
  - id: architecture-review
    title: Architecture review
    questions: Does this cross a boundary?
examples: []
`),
    );

    try {
      await expect(
        loadEffectiveHarnessModel({ profilesDir: tempProfilesDir, projectDir: sampleProjectDir }),
      ).rejects.toThrow(/heuristics\[0\]\.questions must be an array/);
    } finally {
      rmSync(tempProfilesDir, { force: true, recursive: true });
    }
  });

  it("fails when profile guidance ids are duplicated", async () => {
    const tempProfilesDir = copyProfiles();
    writeProfile(
      tempProfilesDir,
      profileYaml(`principles:
  - id: module-ownership
    title: Module ownership
    guidance: Keep module behavior behind public APIs.
  - id: module-ownership
    title: Duplicate module ownership
    guidance: Duplicate guidance.
policies: []
workflows: []
heuristics: []
examples: []
`),
    );

    try {
      await expect(
        loadEffectiveHarnessModel({ profilesDir: tempProfilesDir, projectDir: sampleProjectDir }),
      ).rejects.toThrow(/principles\[1\]\.id duplicates "module-ownership"/);
    } finally {
      rmSync(tempProfilesDir, { force: true, recursive: true });
    }
  });

  it("sorts profile guidance sections deterministically by id", async () => {
    const tempProfilesDir = copyProfiles();
    writeProfile(
      tempProfilesDir,
      profileYaml(`principles:
  - id: z-principle
    title: Z principle
    guidance: Last principle.
  - id: a-principle
    title: A principle
    guidance: First principle.
policies:
  - id: z-policy
    title: Z policy
    intent: Last policy intent.
    severity: warning
    guidance: Last policy guidance.
  - id: a-policy
    title: A policy
    intent: First policy intent.
    severity: advisory
    guidance: First policy guidance.
workflows:
  - id: z-workflow
    title: Z workflow
    steps:
      - Last workflow step.
  - id: a-workflow
    title: A workflow
    steps:
      - First workflow step.
heuristics:
  - id: z-heuristic
    title: Z heuristic
    questions:
      - Last heuristic question?
  - id: a-heuristic
    title: A heuristic
    questions:
      - First heuristic question?
examples:
  - id: z-example
    title: Z example
    good: Last good example.
    bad: Last bad example.
  - id: a-example
    title: A example
    good: First good example.
    bad: First bad example.
`),
    );

    try {
      const model = await loadEffectiveHarnessModel({
        profilesDir: tempProfilesDir,
        projectDir: sampleProjectDir,
      });

      expect(model.principles.map((principle) => principle.id)).toEqual([
        "a-principle",
        "z-principle",
      ]);
      expect(model.policies.map((policy) => policy.id)).toEqual(["a-policy", "z-policy"]);
      expect(model.workflows.map((workflow) => workflow.id)).toEqual(["a-workflow", "z-workflow"]);
      expect(model.heuristics.map((heuristic) => heuristic.id)).toEqual([
        "a-heuristic",
        "z-heuristic",
      ]);
      expect(model.examples.map((example) => example.id)).toEqual(["a-example", "z-example"]);
    } finally {
      rmSync(tempProfilesDir, { force: true, recursive: true });
    }
  });
});

function copySampleProject(): string {
  const projectDir = mkdtempSync(join(tmpdir(), "architect-companion-project-"));
  cpSync(sampleProjectDir, projectDir, { recursive: true });
  return projectDir;
}

function copyProfiles(): string {
  const tempProfilesDir = mkdtempSync(join(tmpdir(), "architect-companion-profiles-"));
  cpSync(profilesDir, tempProfilesDir, { recursive: true });
  return tempProfilesDir;
}

function writeProfile(tempProfilesDir: string, source: string): void {
  writeFileSync(join(tempProfilesDir, "modular-monolith", "profile.yml"), source);
}

function profileYaml(sections: string): string {
  return `schemaVersion: 1
profile:
  name: modular-monolith
  version: 0.1.0
  title: Modular Monolith
  summary: Test profile.
defaults:
  stack: typescript
  targets:
    agentsMd: true
${sections}`;
}
