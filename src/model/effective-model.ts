import { readdir, readFile, stat } from "node:fs/promises";

import path, { posix } from "node:path";
import { parseDocument } from "yaml";

import { knownTargetKeys, type KnownTargetKey } from "../targets/target-registry.js";

export { knownTargetKeys, type KnownTargetKey } from "../targets/target-registry.js";

const supportedPolicySeverities = ["advisory", "warning", "error"] as const;
const supportedPolicyEngines = ["dependency-cruiser"] as const;
const supportedPolicyRenderers = ["dependency-cruiser-config"] as const;

type PolicySeverity = (typeof supportedPolicySeverities)[number];
type PolicyEngine = (typeof supportedPolicyEngines)[number];
type PolicyRenderer = (typeof supportedPolicyRenderers)[number];
type TargetSelection = Partial<Record<KnownTargetKey, boolean>>;

export type ProfileReference = {
  name: string;
  version: string;
};

export type ProfileMetadata = {
  profile: EffectiveProfile;
};

export type PolicyReference = {
  id: string;
  profile: string;
};

export type EffectiveHarnessModel = {
  allowedDependencies: Record<string, string[]>;
  boundaries: EffectiveBoundary[];
  examples: EffectiveExample[];
  heuristics: EffectiveHeuristic[];
  implementations: EffectiveImplementation[];
  policies: EffectivePolicy[];
  principles: EffectivePrinciple[];
  profiles: EffectiveProfile[];
  project: {
    languages: string[];
    name: string;
  };
  schemaVersion: 1;
  targets: Record<KnownTargetKey, boolean>;
  workflows: EffectiveWorkflow[];
};

type EffectiveProfile = {
  name: string;
  summary?: string;
  title?: string;
  version: string;
};

type SourceTagged = {
  sourceProfile: string;
};

type EffectiveBoundary = {
  name: string;
  path: string;
  publicApi: string;
};

type EffectivePrinciple = SourceTagged & {
  guidance: string;
  id: string;
  title: string;
};

type EffectivePolicy = SourceTagged & {
  guidance: string;
  id: string;
  intent: string;
  severity: PolicySeverity;
  title: string;
};

type EffectiveImplementation = SourceTagged & {
  appliesTo: {
    language: string;
  };
  engine: PolicyEngine;
  id: string;
  policy: PolicyReference;
  renderer: PolicyRenderer;
};

type EffectiveWorkflow = SourceTagged & {
  id: string;
  steps: string[];
  title: string;
};

type EffectiveHeuristic = SourceTagged & {
  id: string;
  questions: string[];
  title: string;
};

type EffectiveExample = SourceTagged & {
  bad: string;
  good: string;
  id: string;
  title: string;
};

type ProfileConfig = {
  examples: EffectiveExample[];
  heuristics: EffectiveHeuristic[];
  implementations: EffectiveImplementation[];
  policies: EffectivePolicy[];
  principles: EffectivePrinciple[];
  profile: EffectiveProfile;
  schemaVersion: 1;
  workflows: EffectiveWorkflow[];
};

type HarnessConfig = {
  boundaries: string;
  profiles: ProfileReference[];
  project: {
    languages: string[];
    name: string;
  };
  schemaVersion: 1;
  targets: TargetSelection;
};

type BoundaryMetadata = {
  allowedDependencies: Record<string, string[]>;
  boundaries: EffectiveBoundary[];
  schemaVersion: 1;
};

type LoadEffectiveHarnessModelOptions = {
  profilesDir: string;
  projectDir: string;
};

type ValidationContext = {
  filePath: string;
};

export class HarnessConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessConfigError";
  }
}

export async function loadEffectiveHarnessModel(
  options: LoadEffectiveHarnessModelOptions,
): Promise<EffectiveHarnessModel> {
  const projectDir = path.resolve(options.projectDir);
  const profilesDir = path.resolve(options.profilesDir);
  const harnessDir = path.join(projectDir, ".architect-companion");
  const harnessPath = path.join(harnessDir, "harness.yml");
  const harnessDisplayPath = displayPath(harnessPath, projectDir);

  const harness = parseHarnessConfig(await readYamlFile(harnessPath, harnessDisplayPath), {
    filePath: harnessDisplayPath,
  });

  const profileConfigs = await Promise.all(
    harness.profiles.map(async (profileReference) =>
      loadProfileConfig(
        profilesDir,
        profileReference,
        path.dirname(profilesDir),
        harnessDisplayPath,
      ),
    ),
  );

  const boundariesPath = path.join(harnessDir, harness.boundaries);
  const boundariesDisplayPath = displayPath(boundariesPath, projectDir);
  const boundaryMetadata = parseBoundaryMetadata(
    await readYamlFile(boundariesPath, boundariesDisplayPath),
    {
      filePath: boundariesDisplayPath,
    },
  );

  const policies = profileConfigs.flatMap((config) => config.policies);
  const implementations = resolveActiveImplementations({
    languages: harness.project.languages,
    policies,
    profileConfigs,
  });

  return {
    allowedDependencies: boundaryMetadata.allowedDependencies,
    boundaries: boundaryMetadata.boundaries,
    examples: profileConfigs.flatMap((config) => config.examples),
    heuristics: profileConfigs.flatMap((config) => config.heuristics),
    implementations,
    policies,
    principles: profileConfigs.flatMap((config) => config.principles),
    profiles: profileConfigs.map((config) => config.profile),
    project: harness.project,
    schemaVersion: 1,
    targets: expandTargets(harness.targets),
    workflows: profileConfigs.flatMap((config) => config.workflows),
  };
}

export function serializeEffectiveHarnessModel(model: EffectiveHarnessModel): string {
  return `${JSON.stringify(sortObjectKeys(model), null, 2)}\n`;
}

export async function loadProfileMetadata(
  profilesDir: string,
  profileName: string,
): Promise<ProfileMetadata> {
  const resolvedProfilesDir = path.resolve(profilesDir);
  const profilePath = path.join(resolvedProfilesDir, profileName, "profile.yml");
  const profileDisplayPath = displayPath(profilePath, path.dirname(resolvedProfilesDir));

  const config = parseProfileConfig(await readYamlFile(profilePath, profileDisplayPath), {
    filePath: profileDisplayPath,
  });

  if (config.profile.name !== profileName) {
    throw new HarnessConfigError(
      `${profileDisplayPath}: profile.name "${config.profile.name}" does not match directory "${profileName}".`,
    );
  }

  return {
    profile: config.profile,
  };
}

export async function discoverProfileNames(profilesDir: string): Promise<string[]> {
  const resolvedProfilesDir = path.resolve(profilesDir);

  let entries: string[];
  try {
    entries = await readdir(resolvedProfilesDir);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new HarnessConfigError(`profiles directory not found: ${resolvedProfilesDir}`);
    }

    throw error;
  }

  const names: string[] = [];
  for (const entry of entries) {
    const profileYmlPath = path.join(resolvedProfilesDir, entry, "profile.yml");
    try {
      const stats = await stat(profileYmlPath);
      if (stats.isFile()) {
        names.push(entry);
      }
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  return names.sort();
}

export function formatPolicyReference(reference: PolicyReference): string {
  return `${reference.profile}.${reference.id}`;
}

async function loadProfileConfig(
  profilesDir: string,
  profileReference: ProfileReference,
  displayRoot: string,
  harnessDisplayPath: string,
): Promise<ProfileConfig> {
  const profilePath = path.join(profilesDir, profileReference.name, "profile.yml");
  const profileDisplayPath = displayPath(profilePath, displayRoot);
  const profile = parseProfileConfig(await readYamlFile(profilePath, profileDisplayPath), {
    filePath: profileDisplayPath,
  });

  if (profile.profile.name !== profileReference.name) {
    throw new HarnessConfigError(
      `${profileDisplayPath}: profile.name must match harness profile "${profileReference.name}".`,
    );
  }

  if (profile.profile.version !== profileReference.version) {
    throw new HarnessConfigError(
      `${harnessDisplayPath}: profile "${profileReference.name}" version "${profileReference.version}" does not match ${profileDisplayPath} version "${profile.profile.version}".`,
    );
  }

  return profile;
}

async function readYamlFile(filePath: string, displayFilePath: string): Promise<unknown> {
  let source: string;

  try {
    source = await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new HarnessConfigError(`${displayFilePath}: file not found.`);
    }

    throw error;
  }

  const document = parseDocument(source);
  if (document.errors.length > 0) {
    const firstError = document.errors[0];
    throw new HarnessConfigError(
      `${displayFilePath}: invalid YAML${
        firstError?.message === undefined ? "." : `: ${firstError.message}`
      }`,
    );
  }

  return document.toJS();
}

function parseProfileConfig(value: unknown, context: ValidationContext): ProfileConfig {
  const root = asObject(value, context, "$");
  assertKnownKeys(
    root,
    [
      "schemaVersion",
      "profile",
      "principles",
      "policies",
      "workflows",
      "heuristics",
      "examples",
      "implementations",
    ],
    context,
    "$",
  );
  assertSchemaVersion(root.schemaVersion, context, "schemaVersion");

  const profileRoot = asObject(root.profile, context, "profile");
  assertKnownKeys(profileRoot, ["name", "version", "title", "summary"], context, "profile");

  const profile: EffectiveProfile = {
    name: asIdentifier(profileRoot.name, context, "profile.name"),
    version: asSemver(profileRoot.version, context, "profile.version"),
  };

  const title = optionalString(profileRoot.title, context, "profile.title");
  if (title !== undefined) {
    profile.title = title;
  }

  const summary = optionalString(profileRoot.summary, context, "profile.summary");
  if (summary !== undefined) {
    profile.summary = summary;
  }

  return {
    examples: parseExamples(root.examples, profile.name, context, "examples"),
    heuristics: parseHeuristics(root.heuristics, profile.name, context, "heuristics"),
    implementations: parseImplementations(
      root.implementations,
      profile.name,
      context,
      "implementations",
    ),
    policies: parsePolicies(root.policies, profile.name, context, "policies"),
    principles: parsePrinciples(root.principles, profile.name, context, "principles"),
    profile,
    schemaVersion: 1,
    workflows: parseWorkflows(root.workflows, profile.name, context, "workflows"),
  };
}

function parseHarnessConfig(value: unknown, context: ValidationContext): HarnessConfig {
  const root = asObject(value, context, "$");
  assertKnownKeys(
    root,
    ["schemaVersion", "profiles", "project", "boundaries", "targets"],
    context,
    "$",
  );
  assertSchemaVersion(root.schemaVersion, context, "schemaVersion");

  const projectRoot = asObject(root.project, context, "project");
  assertKnownKeys(projectRoot, ["name", "languages"], context, "project");

  return {
    boundaries: asRelativePath(root.boundaries, context, "boundaries"),
    profiles: parseProfileReferences(root.profiles, context, "profiles"),
    project: {
      languages: parseLanguages(projectRoot.languages, context, "project.languages"),
      name: asIdentifier(projectRoot.name, context, "project.name"),
    },
    schemaVersion: 1,
    targets: parseTargets(root.targets, context, "targets"),
  };
}

function parseProfileReferences(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): ProfileReference[] {
  if (!Array.isArray(value)) {
    throw expected(context, fieldPath, "array");
  }

  if (value.length === 0) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must include at least one item.`,
    );
  }

  const names = new Set<string>();
  return value.map((itemValue, index): ProfileReference => {
    const itemPath = `${fieldPath}[${index}]`;
    const itemRoot = asObject(itemValue, context, itemPath);
    assertKnownKeys(itemRoot, ["name", "version"], context, itemPath);

    const name = asIdentifier(itemRoot.name, context, `${itemPath}.name`);
    if (names.has(name)) {
      throw new HarnessConfigError(
        `${context.filePath}: ${itemPath}.name duplicates profile "${name}".`,
      );
    }
    names.add(name);

    return {
      name,
      version: asSemver(itemRoot.version, context, `${itemPath}.version`),
    };
  });
}

function parseLanguages(value: unknown, context: ValidationContext, fieldPath: string): string[] {
  if (!Array.isArray(value)) {
    throw expected(context, fieldPath, "array");
  }

  if (value.length === 0) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must include at least one item.`,
    );
  }

  const languages = new Set<string>();
  return value.map((item, index) => {
    const language = asIdentifier(item, context, `${fieldPath}[${index}]`);
    if (languages.has(language)) {
      throw new HarnessConfigError(
        `${context.filePath}: ${fieldPath}[${index}] duplicates language "${language}".`,
      );
    }
    languages.add(language);
    return language;
  });
}

function parseBoundaryMetadata(value: unknown, context: ValidationContext): BoundaryMetadata {
  const root = asObject(value, context, "$");
  assertKnownKeys(root, ["schemaVersion", "boundaries", "allowed_dependencies"], context, "$");
  assertSchemaVersion(root.schemaVersion, context, "schemaVersion");

  if (!Array.isArray(root.boundaries)) {
    throw expected(context, "boundaries", "array");
  }

  const boundaryNames = new Set<string>();
  const boundaries = root.boundaries.map((boundaryValue, index): EffectiveBoundary => {
    const fieldPath = `boundaries[${index}]`;
    const boundaryRoot = asObject(boundaryValue, context, fieldPath);
    assertKnownKeys(boundaryRoot, ["name", "path", "public_api"], context, fieldPath);

    const name = asIdentifier(boundaryRoot.name, context, `${fieldPath}.name`);
    if (boundaryNames.has(name)) {
      throw new HarnessConfigError(
        `${context.filePath}: ${fieldPath}.name duplicates boundary "${name}".`,
      );
    }

    boundaryNames.add(name);

    return {
      name,
      path: asRelativePath(boundaryRoot.path, context, `${fieldPath}.path`),
      publicApi: asRelativePath(boundaryRoot.public_api, context, `${fieldPath}.public_api`),
    };
  });

  const allowedDependencies = parseAllowedDependencies(
    root.allowed_dependencies,
    boundaryNames,
    context,
    "allowed_dependencies",
  );

  return {
    allowedDependencies,
    boundaries: boundaries.sort((left, right) => left.name.localeCompare(right.name)),
    schemaVersion: 1,
  };
}

function parsePrinciples(
  value: unknown,
  sourceProfile: string,
  context: ValidationContext,
  fieldPath: string,
): EffectivePrinciple[] {
  return parseIdentifiedItems(
    value,
    context,
    fieldPath,
    (itemRoot, itemPath): EffectivePrinciple => {
      assertKnownKeys(itemRoot, ["id", "title", "guidance"], context, itemPath);

      return {
        guidance: asNonEmptyString(itemRoot.guidance, context, `${itemPath}.guidance`),
        id: asIdentifier(itemRoot.id, context, `${itemPath}.id`),
        sourceProfile,
        title: asNonEmptyString(itemRoot.title, context, `${itemPath}.title`),
      };
    },
  );
}

function parsePolicies(
  value: unknown,
  sourceProfile: string,
  context: ValidationContext,
  fieldPath: string,
): EffectivePolicy[] {
  return parseIdentifiedItems(
    value,
    context,
    fieldPath,
    (policyRoot, policyPath): EffectivePolicy => {
      assertKnownKeys(
        policyRoot,
        ["id", "title", "intent", "severity", "guidance"],
        context,
        policyPath,
      );

      return {
        guidance: asNonEmptyString(policyRoot.guidance, context, `${policyPath}.guidance`),
        id: asIdentifier(policyRoot.id, context, `${policyPath}.id`),
        intent: asNonEmptyString(policyRoot.intent, context, `${policyPath}.intent`),
        severity: asPolicySeverity(policyRoot.severity, context, `${policyPath}.severity`),
        sourceProfile,
        title: asNonEmptyString(policyRoot.title, context, `${policyPath}.title`),
      };
    },
  );
}

function parseImplementations(
  value: unknown,
  sourceProfile: string,
  context: ValidationContext,
  fieldPath: string,
): EffectiveImplementation[] {
  return parseIdentifiedItems(
    value,
    context,
    fieldPath,
    (implementationRoot, implementationPath): EffectiveImplementation => {
      assertKnownKeys(
        implementationRoot,
        ["id", "policy", "appliesTo", "engine", "renderer"],
        context,
        implementationPath,
      );

      const policyRoot = asObject(
        implementationRoot.policy,
        context,
        `${implementationPath}.policy`,
      );
      assertKnownKeys(policyRoot, ["profile", "id"], context, `${implementationPath}.policy`);

      const appliesToRoot = asObject(
        implementationRoot.appliesTo,
        context,
        `${implementationPath}.appliesTo`,
      );
      assertKnownKeys(appliesToRoot, ["language"], context, `${implementationPath}.appliesTo`);

      return {
        appliesTo: {
          language: asIdentifier(
            appliesToRoot.language,
            context,
            `${implementationPath}.appliesTo.language`,
          ),
        },
        engine: asPolicyEngine(implementationRoot.engine, context, `${implementationPath}.engine`),
        id: asIdentifier(implementationRoot.id, context, `${implementationPath}.id`),
        policy: {
          id: asIdentifier(policyRoot.id, context, `${implementationPath}.policy.id`),
          profile: asIdentifier(
            policyRoot.profile,
            context,
            `${implementationPath}.policy.profile`,
          ),
        },
        renderer: asPolicyRenderer(
          implementationRoot.renderer,
          context,
          `${implementationPath}.renderer`,
        ),
        sourceProfile,
      };
    },
  );
}

function parseWorkflows(
  value: unknown,
  sourceProfile: string,
  context: ValidationContext,
  fieldPath: string,
): EffectiveWorkflow[] {
  return parseIdentifiedItems(value, context, fieldPath, (workflowRoot, workflowPath) => {
    assertKnownKeys(workflowRoot, ["id", "title", "steps"], context, workflowPath);

    return {
      id: asIdentifier(workflowRoot.id, context, `${workflowPath}.id`),
      sourceProfile,
      steps: asNonEmptyStringArray(workflowRoot.steps, context, `${workflowPath}.steps`),
      title: asNonEmptyString(workflowRoot.title, context, `${workflowPath}.title`),
    };
  });
}

function parseHeuristics(
  value: unknown,
  sourceProfile: string,
  context: ValidationContext,
  fieldPath: string,
): EffectiveHeuristic[] {
  return parseIdentifiedItems(value, context, fieldPath, (heuristicRoot, heuristicPath) => {
    assertKnownKeys(heuristicRoot, ["id", "title", "questions"], context, heuristicPath);

    return {
      id: asIdentifier(heuristicRoot.id, context, `${heuristicPath}.id`),
      questions: asNonEmptyStringArray(
        heuristicRoot.questions,
        context,
        `${heuristicPath}.questions`,
      ),
      sourceProfile,
      title: asNonEmptyString(heuristicRoot.title, context, `${heuristicPath}.title`),
    };
  });
}

function parseExamples(
  value: unknown,
  sourceProfile: string,
  context: ValidationContext,
  fieldPath: string,
): EffectiveExample[] {
  return parseIdentifiedItems(value, context, fieldPath, (exampleRoot, examplePath) => {
    assertKnownKeys(exampleRoot, ["id", "title", "good", "bad"], context, examplePath);

    return {
      bad: asNonEmptyString(exampleRoot.bad, context, `${examplePath}.bad`),
      good: asNonEmptyString(exampleRoot.good, context, `${examplePath}.good`),
      id: asIdentifier(exampleRoot.id, context, `${examplePath}.id`),
      sourceProfile,
      title: asNonEmptyString(exampleRoot.title, context, `${examplePath}.title`),
    };
  });
}

function resolveActiveImplementations(args: {
  languages: string[];
  policies: EffectivePolicy[];
  profileConfigs: ProfileConfig[];
}): EffectiveImplementation[] {
  const selectedProfiles = new Set(args.profileConfigs.map((config) => config.profile.name));
  const selectedLanguages = new Set(args.languages);
  const policiesByReference = new Set(args.policies.map((policy) => policyKey(policy)));
  const activeImplementations: EffectiveImplementation[] = [];

  for (const implementation of args.profileConfigs.flatMap((config) => config.implementations)) {
    if (!selectedProfiles.has(implementation.policy.profile)) {
      continue;
    }

    if (!selectedLanguages.has(implementation.appliesTo.language)) {
      continue;
    }

    if (!policiesByReference.has(policyKey(implementation.policy))) {
      throw new HarnessConfigError(
        `implementation "${implementation.sourceProfile}.${implementation.id}" references selected policy "${formatPolicyReference(implementation.policy)}", but that policy does not exist.`,
      );
    }

    activeImplementations.push(implementation);
  }

  return activeImplementations;
}

function policyKey(reference: PolicyReference | EffectivePolicy): string {
  return "profile" in reference
    ? `${reference.profile}:${reference.id}`
    : `${reference.sourceProfile}:${reference.id}`;
}

function parseIdentifiedItems<T extends { id: string }>(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
  parseItem: (itemRoot: Record<string, unknown>, itemPath: string) => T,
): T[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw expected(context, fieldPath, "array");
  }

  const itemIds = new Set<string>();
  return value
    .map((itemValue, index): T => {
      const itemPath = `${fieldPath}[${index}]`;
      const item = parseItem(asObject(itemValue, context, itemPath), itemPath);
      if (itemIds.has(item.id)) {
        throw new HarnessConfigError(
          `${context.filePath}: ${itemPath}.id duplicates "${item.id}".`,
        );
      }

      itemIds.add(item.id);
      return item;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function parseAllowedDependencies(
  value: unknown,
  boundaryNames: Set<string>,
  context: ValidationContext,
  fieldPath: string,
): Record<string, string[]> {
  if (value === undefined) {
    return {};
  }

  const root = asObject(value, context, fieldPath);
  const result: Record<string, string[]> = {};

  for (const [sourceBoundary, dependencies] of Object.entries(root)) {
    if (!boundaryNames.has(sourceBoundary)) {
      throw new HarnessConfigError(
        `${context.filePath}: ${fieldPath}.${sourceBoundary} references unknown boundary "${sourceBoundary}".`,
      );
    }

    const dependencyPath = `${fieldPath}.${sourceBoundary}`;
    if (!Array.isArray(dependencies)) {
      throw expected(context, dependencyPath, "array");
    }

    const uniqueDependencies = new Set<string>();
    dependencies.forEach((dependency, index) => {
      const dependencyName = asIdentifier(dependency, context, `${dependencyPath}[${index}]`);
      if (!boundaryNames.has(dependencyName)) {
        throw new HarnessConfigError(
          `${context.filePath}: ${dependencyPath}[${index}] references unknown boundary "${dependencyName}".`,
        );
      }
      uniqueDependencies.add(dependencyName);
    });

    result[sourceBoundary] = Array.from(uniqueDependencies).sort((left, right) =>
      left.localeCompare(right),
    );
  }

  return sortRecord(result);
}

function parseTargets(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): TargetSelection {
  const root = asObject(value, context, fieldPath);
  assertKnownKeys(root, knownTargetKeys, context, fieldPath);

  const targets: TargetSelection = {};
  for (const key of knownTargetKeys) {
    if (root[key] !== undefined) {
      targets[key] = asBoolean(root[key], context, `${fieldPath}.${key}`);
    }
  }

  return targets;
}

function expandTargets(targetSelection: TargetSelection): Record<KnownTargetKey, boolean> {
  const targets = Object.fromEntries(knownTargetKeys.map((key) => [key, false])) as Record<
    KnownTargetKey,
    boolean
  >;

  for (const key of knownTargetKeys) {
    targets[key] = targetSelection[key] ?? false;
  }

  return targets;
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  context: ValidationContext,
  fieldPath: string,
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      const fullPath = fieldPath === "$" ? key : `${fieldPath}.${key}`;
      throw new HarnessConfigError(`${context.filePath}: ${fullPath} is not supported.`);
    }
  }
}

function assertSchemaVersion(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): asserts value is 1 {
  if (value !== 1) {
    throw new HarnessConfigError(`${context.filePath}: ${fieldPath} must be 1.`);
  }
}

function asObject(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw expected(context, fieldPath, "object");
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown, context: ValidationContext, fieldPath: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw expected(context, fieldPath, "non-empty string");
  }

  return value;
}

function optionalString(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return asNonEmptyString(value, context, fieldPath);
}

function asNonEmptyStringArray(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): string[] {
  if (!Array.isArray(value)) {
    throw expected(context, fieldPath, "array");
  }

  if (value.length === 0) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must include at least one item.`,
    );
  }

  return value.map((item, index) => asNonEmptyString(item, context, `${fieldPath}[${index}]`));
}

function asIdentifier(value: unknown, context: ValidationContext, fieldPath: string): string {
  const identifier = asNonEmptyString(value, context, fieldPath);
  if (!/^[a-z][a-z0-9-]*$/.test(identifier)) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must use lowercase letters, numbers, and hyphens, starting with a letter.`,
    );
  }

  return identifier;
}

function asSemver(value: unknown, context: ValidationContext, fieldPath: string): string {
  const version = asNonEmptyString(value, context, fieldPath);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new HarnessConfigError(`${context.filePath}: ${fieldPath} must be a semantic version.`);
  }

  return version;
}

function asPolicySeverity(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): PolicySeverity {
  const severity = asNonEmptyString(value, context, fieldPath);
  if (!isOneOf(severity, supportedPolicySeverities)) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must be one of: ${supportedPolicySeverities.join(", ")}.`,
    );
  }

  return severity;
}

function asPolicyEngine(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): PolicyEngine {
  const engine = asNonEmptyString(value, context, fieldPath);
  if (!isOneOf(engine, supportedPolicyEngines)) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must be one of: ${supportedPolicyEngines.join(", ")}.`,
    );
  }

  return engine;
}

function asPolicyRenderer(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): PolicyRenderer {
  const renderer = asNonEmptyString(value, context, fieldPath);
  if (!isOneOf(renderer, supportedPolicyRenderers)) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must be one of: ${supportedPolicyRenderers.join(", ")}.`,
    );
  }

  return renderer;
}

function asRelativePath(value: unknown, context: ValidationContext, fieldPath: string): string {
  const rawPath = asNonEmptyString(value, context, fieldPath);

  if (rawPath.includes("\\")) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must use POSIX-style forward slashes.`,
    );
  }

  if (path.isAbsolute(rawPath) || posix.isAbsolute(rawPath)) {
    throw new HarnessConfigError(`${context.filePath}: ${fieldPath} must be a relative path.`);
  }

  const normalized = posix.normalize(rawPath);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.split("/").some((segment) => segment === "")
  ) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must be a normalized relative path that does not escape the project.`,
    );
  }

  return normalized;
}

function asBoolean(value: unknown, context: ValidationContext, fieldPath: string): boolean {
  if (typeof value !== "boolean") {
    throw expected(context, fieldPath, "boolean");
  }

  return value;
}

function expected(context: ValidationContext, fieldPath: string, expectedType: string): Error {
  return new HarnessConfigError(
    `${context.filePath}: ${fieldPath} must be ${article(expectedType)} ${expectedType}.`,
  );
}

function article(value: string): "a" | "an" {
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

function isOneOf<T extends readonly string[]>(value: string, allowed: T): value is T[number] {
  return (allowed as readonly string[]).includes(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function displayPath(filePath: string, relativeTo: string): string {
  const relative = path.relative(relativeTo, filePath).replaceAll(path.sep, "/");
  return relative.startsWith("..") ? filePath : relative;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sortObjectKeys(record[key])]),
  );
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}
