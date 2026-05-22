import { readFile } from "node:fs/promises";
import path, { posix } from "node:path";
import { parseDocument } from "yaml";

const knownTargetKeys = ["agentsMd", "cursor", "dependencyCruiser", "githubActions"] as const;
const supportedStacks = ["typescript"] as const;
const supportedPolicySeverities = ["advisory", "warning", "error"] as const;
const supportedPolicyEngines = ["dependency-cruiser"] as const;
const supportedPolicyRenderers = ["dependency-cruiser-config"] as const;

type KnownTargetKey = (typeof knownTargetKeys)[number];
type SupportedStack = (typeof supportedStacks)[number];
type PolicySeverity = (typeof supportedPolicySeverities)[number];
type PolicyEngine = (typeof supportedPolicyEngines)[number];
type PolicyRenderer = (typeof supportedPolicyRenderers)[number];
type TargetSelection = Partial<Record<KnownTargetKey, boolean>>;

export type EffectiveHarnessModel = {
  allowedDependencies: Record<string, string[]>;
  examples: EffectiveExample[];
  heuristics: EffectiveHeuristic[];
  modules: EffectiveModule[];
  policies: EffectivePolicy[];
  principles: EffectivePrinciple[];
  profile: EffectiveProfile;
  project: {
    name: string;
  };
  schemaVersion: 1;
  stack: SupportedStack;
  targets: Record<KnownTargetKey, boolean>;
  workflows: EffectiveWorkflow[];
};

type EffectiveProfile = {
  name: string;
  summary?: string;
  title?: string;
  version: string;
};

type EffectiveModule = {
  name: string;
  path: string;
  publicApi: string;
};

type EffectivePrinciple = {
  guidance: string;
  id: string;
  title: string;
};

type EffectivePolicy = {
  guidance: string;
  id: string;
  implementation?: Partial<Record<SupportedStack, EffectivePolicyImplementation>>;
  intent: string;
  severity: PolicySeverity;
  title: string;
};

type EffectivePolicyImplementation = {
  engine: PolicyEngine;
  renderer: PolicyRenderer;
};

type EffectiveWorkflow = {
  id: string;
  steps: string[];
  title: string;
};

type EffectiveHeuristic = {
  id: string;
  questions: string[];
  title: string;
};

type EffectiveExample = {
  bad: string;
  good: string;
  id: string;
  title: string;
};

type ProfileConfig = {
  defaults: {
    stack?: SupportedStack;
    targets: TargetSelection;
  };
  examples: EffectiveExample[];
  heuristics: EffectiveHeuristic[];
  policies: EffectivePolicy[];
  principles: EffectivePrinciple[];
  profile: EffectiveProfile;
  schemaVersion: 1;
  workflows: EffectiveWorkflow[];
};

type HarnessConfig = {
  modules: string;
  profile: {
    name: string;
    version: string;
  };
  project: {
    name: string;
  };
  schemaVersion: 1;
  stack?: SupportedStack;
  targets: TargetSelection;
};

type ModuleMetadata = {
  allowedDependencies: Record<string, string[]>;
  modules: EffectiveModule[];
  schemaVersion: 1;
};

type LoadEffectiveHarnessModelOptions = {
  profilesDir: string;
  projectDir: string;
};

type ValidationContext = {
  filePath: string;
};

export type ProfileMetadata = {
  name: string;
  summary?: string;
  title?: string;
  version: string;
};

export function parseProfileFromYaml(source: string, displayPath = "profile.yml"): ProfileMetadata {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    const firstError = document.errors[0];
    throw new HarnessConfigError(
      `${displayPath}: invalid YAML${firstError?.message === undefined ? "." : `: ${firstError.message}`}`,
    );
  }

  const config = parseProfileConfig(document.toJS(), { filePath: displayPath });
  const metadata: ProfileMetadata = {
    name: config.profile.name,
    version: config.profile.version,
  };
  if (config.profile.summary !== undefined) metadata.summary = config.profile.summary;
  if (config.profile.title !== undefined) metadata.title = config.profile.title;
  return metadata;
}

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

  const profilePath = path.join(profilesDir, harness.profile.name, "profile.yml");
  const profileDisplayPath = displayPath(profilePath, path.dirname(profilesDir));
  const profile = parseProfileConfig(await readYamlFile(profilePath, profileDisplayPath), {
    filePath: profileDisplayPath,
  });

  if (profile.profile.name !== harness.profile.name) {
    throw new HarnessConfigError(
      `${profileDisplayPath}: profile.name must match harness profile "${harness.profile.name}".`,
    );
  }

  if (profile.profile.version !== harness.profile.version) {
    throw new HarnessConfigError(
      `${harnessDisplayPath}: profile.version "${harness.profile.version}" does not match ${profileDisplayPath} version "${profile.profile.version}".`,
    );
  }

  const modulesPath = path.join(harnessDir, harness.modules);
  const modulesDisplayPath = displayPath(modulesPath, projectDir);
  const moduleMetadata = parseModuleMetadata(await readYamlFile(modulesPath, modulesDisplayPath), {
    filePath: modulesDisplayPath,
  });

  const stack = harness.stack ?? profile.defaults.stack;
  if (stack === undefined) {
    throw new HarnessConfigError(
      `${harnessDisplayPath}: stack is required when the selected profile has no default stack.`,
    );
  }

  return {
    allowedDependencies: moduleMetadata.allowedDependencies,
    examples: profile.examples,
    heuristics: profile.heuristics,
    modules: moduleMetadata.modules,
    policies: profile.policies,
    principles: profile.principles,
    profile: profile.profile,
    project: harness.project,
    schemaVersion: 1,
    stack,
    targets: mergeTargets(profile.defaults.targets, harness.targets),
    workflows: profile.workflows,
  };
}

export type BuildModelOptions = {
  modulesYaml: string;
  profileYaml: string;
  project: { name: string };
  stack?: string;
  targets?: Record<string, boolean>;
};

export function buildEffectiveHarnessModel(options: BuildModelOptions): EffectiveHarnessModel {
  const profileDoc = parseDocument(options.profileYaml);
  if (profileDoc.errors.length > 0) {
    const firstError = profileDoc.errors[0];
    throw new HarnessConfigError(
      `profile.yml: invalid YAML${firstError?.message === undefined ? "." : `: ${firstError.message}`}`,
    );
  }
  const profile = parseProfileConfig(profileDoc.toJS(), { filePath: "profile.yml" });

  const modulesDoc = parseDocument(options.modulesYaml);
  if (modulesDoc.errors.length > 0) {
    const firstError = modulesDoc.errors[0];
    throw new HarnessConfigError(
      `modules.yml: invalid YAML${firstError?.message === undefined ? "." : `: ${firstError.message}`}`,
    );
  }
  const moduleMetadata = parseModuleMetadata(modulesDoc.toJS(), { filePath: "modules.yml" });

  const harnessTargets: TargetSelection = {};
  if (options.targets !== undefined) {
    for (const key of knownTargetKeys) {
      const value = options.targets[key];
      if (value !== undefined) {
        harnessTargets[key] = value;
      }
    }
  }

  let stack: SupportedStack | undefined;
  if (options.stack !== undefined) {
    if (!isSupportedStack(options.stack)) {
      throw new HarnessConfigError(
        `request: stack must be one of: ${supportedStacks.join(", ")}.`,
      );
    }
    stack = options.stack;
  } else {
    stack = profile.defaults.stack;
  }

  if (stack === undefined) {
    throw new HarnessConfigError(
      "request: stack is required when the selected profile has no default stack.",
    );
  }

  return {
    allowedDependencies: moduleMetadata.allowedDependencies,
    examples: profile.examples,
    heuristics: profile.heuristics,
    modules: moduleMetadata.modules,
    policies: profile.policies,
    principles: profile.principles,
    profile: profile.profile,
    project: options.project,
    schemaVersion: 1,
    stack,
    targets: mergeTargets(profile.defaults.targets, harnessTargets),
    workflows: profile.workflows,
  };
}

export type HarnessReference = {
  modules: string;
  profile: { name: string; version: string };
  project: { name: string };
  stack?: string;
  targets?: Record<string, boolean>;
};

export function parseHarnessFromYaml(source: string, displayPath = "harness.yml"): HarnessReference {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    const firstError = document.errors[0];
    throw new HarnessConfigError(
      `${displayPath}: invalid YAML${firstError?.message === undefined ? "." : `: ${firstError.message}`}`,
    );
  }
  const harness = parseHarnessConfig(document.toJS(), { filePath: displayPath });

  const ref: HarnessReference = {
    modules: harness.modules,
    profile: { name: harness.profile.name, version: harness.profile.version },
    project: { name: harness.project.name },
  };
  if (harness.stack !== undefined) ref.stack = harness.stack;
  if (Object.keys(harness.targets).length > 0) ref.targets = harness.targets;
  return ref;
}

export function serializeEffectiveHarnessModel(model: EffectiveHarnessModel): string {
  return `${JSON.stringify(sortObjectKeys(model), null, 2)}\n`;
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
      "defaults",
      "principles",
      "policies",
      "workflows",
      "heuristics",
      "examples",
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

  const defaultsRoot =
    root.defaults === undefined ? {} : asObject(root.defaults, context, "defaults");
  assertKnownKeys(defaultsRoot, ["stack", "targets"], context, "defaults");

  const stack = optionalStack(defaultsRoot.stack, context, "defaults.stack");
  const targets = parseTargets(defaultsRoot.targets, context, "defaults.targets");
  const principles = parsePrinciples(root.principles, context, "principles");
  const policies = parsePolicies(root.policies, context, "policies");
  const workflows = parseWorkflows(root.workflows, context, "workflows");
  const heuristics = parseHeuristics(root.heuristics, context, "heuristics");
  const examples = parseExamples(root.examples, context, "examples");

  const defaults: ProfileConfig["defaults"] = { targets };
  if (stack !== undefined) {
    defaults.stack = stack;
  }

  return {
    defaults,
    examples,
    heuristics,
    policies,
    principles,
    profile,
    schemaVersion: 1,
    workflows,
  };
}

function parseHarnessConfig(value: unknown, context: ValidationContext): HarnessConfig {
  const root = asObject(value, context, "$");
  assertKnownKeys(
    root,
    ["schemaVersion", "profile", "project", "stack", "modules", "targets"],
    context,
    "$",
  );
  assertSchemaVersion(root.schemaVersion, context, "schemaVersion");

  const profileRoot = asObject(root.profile, context, "profile");
  assertKnownKeys(profileRoot, ["name", "version"], context, "profile");

  const projectRoot = asObject(root.project, context, "project");
  assertKnownKeys(projectRoot, ["name"], context, "project");

  const stack = optionalStack(root.stack, context, "stack");
  const modules = asRelativePath(root.modules, context, "modules");
  const targets = parseTargets(root.targets, context, "targets");

  const harness: HarnessConfig = {
    modules,
    profile: {
      name: asIdentifier(profileRoot.name, context, "profile.name"),
      version: asSemver(profileRoot.version, context, "profile.version"),
    },
    project: {
      name: asIdentifier(projectRoot.name, context, "project.name"),
    },
    schemaVersion: 1,
    targets,
  };

  if (stack !== undefined) {
    harness.stack = stack;
  }

  return harness;
}

function parseModuleMetadata(value: unknown, context: ValidationContext): ModuleMetadata {
  const root = asObject(value, context, "$");
  assertKnownKeys(root, ["schemaVersion", "modules", "allowed_dependencies"], context, "$");
  assertSchemaVersion(root.schemaVersion, context, "schemaVersion");

  if (!Array.isArray(root.modules)) {
    throw expected(context, "modules", "array");
  }

  const moduleNames = new Set<string>();
  const modules = root.modules.map((moduleValue, index): EffectiveModule => {
    const fieldPath = `modules[${index}]`;
    const moduleRoot = asObject(moduleValue, context, fieldPath);
    assertKnownKeys(moduleRoot, ["name", "path", "public_api"], context, fieldPath);

    const name = asIdentifier(moduleRoot.name, context, `${fieldPath}.name`);
    if (moduleNames.has(name)) {
      throw new HarnessConfigError(
        `${context.filePath}: ${fieldPath}.name duplicates module "${name}".`,
      );
    }

    moduleNames.add(name);

    return {
      name,
      path: asRelativePath(moduleRoot.path, context, `${fieldPath}.path`),
      publicApi: asRelativePath(moduleRoot.public_api, context, `${fieldPath}.public_api`),
    };
  });

  const allowedDependencies = parseAllowedDependencies(
    root.allowed_dependencies,
    moduleNames,
    context,
    "allowed_dependencies",
  );

  return {
    allowedDependencies,
    modules: modules.sort((left, right) => left.name.localeCompare(right.name)),
    schemaVersion: 1,
  };
}

function parsePrinciples(
  value: unknown,
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
        title: asNonEmptyString(itemRoot.title, context, `${itemPath}.title`),
      };
    },
  );
}

function parsePolicies(
  value: unknown,
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
        ["id", "title", "intent", "severity", "guidance", "implementation"],
        context,
        policyPath,
      );

      const policy: EffectivePolicy = {
        guidance: asNonEmptyString(policyRoot.guidance, context, `${policyPath}.guidance`),
        id: asIdentifier(policyRoot.id, context, `${policyPath}.id`),
        intent: asNonEmptyString(policyRoot.intent, context, `${policyPath}.intent`),
        severity: asPolicySeverity(policyRoot.severity, context, `${policyPath}.severity`),
        title: asNonEmptyString(policyRoot.title, context, `${policyPath}.title`),
      };

      const implementation = parsePolicyImplementation(
        policyRoot.implementation,
        context,
        `${policyPath}.implementation`,
      );
      if (implementation !== undefined) {
        policy.implementation = implementation;
      }

      return policy;
    },
  );
}

function parseWorkflows(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): EffectiveWorkflow[] {
  return parseIdentifiedItems(value, context, fieldPath, (workflowRoot, workflowPath) => {
    assertKnownKeys(workflowRoot, ["id", "title", "steps"], context, workflowPath);

    return {
      id: asIdentifier(workflowRoot.id, context, `${workflowPath}.id`),
      steps: asNonEmptyStringArray(workflowRoot.steps, context, `${workflowPath}.steps`),
      title: asNonEmptyString(workflowRoot.title, context, `${workflowPath}.title`),
    };
  });
}

function parseHeuristics(
  value: unknown,
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
      title: asNonEmptyString(heuristicRoot.title, context, `${heuristicPath}.title`),
    };
  });
}

function parseExamples(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): EffectiveExample[] {
  return parseIdentifiedItems(value, context, fieldPath, (exampleRoot, examplePath) => {
    assertKnownKeys(exampleRoot, ["id", "title", "good", "bad"], context, examplePath);

    return {
      bad: asNonEmptyString(exampleRoot.bad, context, `${examplePath}.bad`),
      good: asNonEmptyString(exampleRoot.good, context, `${examplePath}.good`),
      id: asIdentifier(exampleRoot.id, context, `${examplePath}.id`),
      title: asNonEmptyString(exampleRoot.title, context, `${examplePath}.title`),
    };
  });
}

function parsePolicyImplementation(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): Partial<Record<SupportedStack, EffectivePolicyImplementation>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  const root = asObject(value, context, fieldPath);
  assertKnownKeys(root, supportedStacks, context, fieldPath);

  const implementation: Partial<Record<SupportedStack, EffectivePolicyImplementation>> = {};
  for (const stack of supportedStacks) {
    if (root[stack] === undefined) {
      continue;
    }

    const stackPath = `${fieldPath}.${stack}`;
    const stackRoot = asObject(root[stack], context, stackPath);
    assertKnownKeys(stackRoot, ["engine", "renderer"], context, stackPath);
    implementation[stack] = {
      engine: asPolicyEngine(stackRoot.engine, context, `${stackPath}.engine`),
      renderer: asPolicyRenderer(stackRoot.renderer, context, `${stackPath}.renderer`),
    };
  }

  if (Object.keys(implementation).length === 0) {
    return undefined;
  }

  return implementation;
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
  moduleNames: Set<string>,
  context: ValidationContext,
  fieldPath: string,
): Record<string, string[]> {
  if (value === undefined) {
    return {};
  }

  const root = asObject(value, context, fieldPath);
  const result: Record<string, string[]> = {};

  for (const [sourceModule, dependencies] of Object.entries(root)) {
    if (!moduleNames.has(sourceModule)) {
      throw new HarnessConfigError(
        `${context.filePath}: ${fieldPath}.${sourceModule} references unknown module "${sourceModule}".`,
      );
    }

    const dependencyPath = `${fieldPath}.${sourceModule}`;
    if (!Array.isArray(dependencies)) {
      throw expected(context, dependencyPath, "array");
    }

    const uniqueDependencies = new Set<string>();
    dependencies.forEach((dependency, index) => {
      const dependencyName = asIdentifier(dependency, context, `${dependencyPath}[${index}]`);
      if (!moduleNames.has(dependencyName)) {
        throw new HarnessConfigError(
          `${context.filePath}: ${dependencyPath}[${index}] references unknown module "${dependencyName}".`,
        );
      }
      uniqueDependencies.add(dependencyName);
    });

    result[sourceModule] = Array.from(uniqueDependencies).sort((left, right) =>
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
  if (value === undefined) {
    return {};
  }

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

function mergeTargets(
  profileTargets: TargetSelection,
  harnessTargets: TargetSelection,
): Record<KnownTargetKey, boolean> {
  const targets = Object.fromEntries(knownTargetKeys.map((key) => [key, false])) as Record<
    KnownTargetKey,
    boolean
  >;

  for (const key of knownTargetKeys) {
    targets[key] = profileTargets[key] ?? targets[key];
    targets[key] = harnessTargets[key] ?? targets[key];
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

function optionalStack(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): SupportedStack | undefined {
  if (value === undefined) {
    return undefined;
  }

  const stack = asNonEmptyString(value, context, fieldPath);
  if (!isSupportedStack(stack)) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must be one of: ${supportedStacks.join(", ")}.`,
    );
  }

  return stack;
}

function asPolicySeverity(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): PolicySeverity {
  const severity = asNonEmptyString(value, context, fieldPath);
  if (!isPolicySeverity(severity)) {
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
  if (!isPolicyEngine(engine)) {
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
  if (!isPolicyRenderer(renderer)) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must be one of: ${supportedPolicyRenderers.join(", ")}.`,
    );
  }

  return renderer;
}

function asRelativePath(value: unknown, context: ValidationContext, fieldPath: string): string {
  const relativePath = asNonEmptyString(value, context, fieldPath);

  if (relativePath.includes("\\")) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must use POSIX-style forward slashes.`,
    );
  }

  if (path.isAbsolute(relativePath) || posix.isAbsolute(relativePath)) {
    throw new HarnessConfigError(`${context.filePath}: ${fieldPath} must be relative.`);
  }

  const normalized = posix.normalize(relativePath);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new HarnessConfigError(`${context.filePath}: ${fieldPath} must stay within the project.`);
  }

  return normalized;
}

function asBoolean(value: unknown, context: ValidationContext, fieldPath: string): boolean {
  if (typeof value !== "boolean") {
    throw expected(context, fieldPath, "boolean");
  }

  return value;
}

function expected(
  context: ValidationContext,
  fieldPath: string,
  expectedType: string,
): HarnessConfigError {
  const article = /^[aeiou]/.test(expectedType) ? "an" : "a";
  return new HarnessConfigError(
    `${context.filePath}: ${fieldPath} must be ${article} ${expectedType}.`,
  );
}

function isSupportedStack(value: string): value is SupportedStack {
  return (supportedStacks as readonly string[]).includes(value);
}

function isPolicySeverity(value: string): value is PolicySeverity {
  return (supportedPolicySeverities as readonly string[]).includes(value);
}

function isPolicyEngine(value: string): value is PolicyEngine {
  return (supportedPolicyEngines as readonly string[]).includes(value);
}

function isPolicyRenderer(value: string): value is PolicyRenderer {
  return (supportedPolicyRenderers as readonly string[]).includes(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, objectValue]) => [key, sortObjectKeys(objectValue)]),
  );
}

function displayPath(filePath: string, baseDir: string): string {
  const relativePath = path.relative(baseDir, filePath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return filePath;
  }

  return relativePath.split(path.sep).join("/");
}
