import { readFile } from "node:fs/promises";
import path, { posix } from "node:path";
import { parseDocument } from "yaml";

const knownTargetKeys = ["agentsMd", "cursor", "dependencyCruiser", "githubActions"] as const;
const supportedStacks = ["typescript"] as const;
const supportedPolicySeverities = ["advisory", "warning", "error"] as const;

type KnownTargetKey = (typeof knownTargetKeys)[number];
type SupportedStack = (typeof supportedStacks)[number];
type PolicySeverity = (typeof supportedPolicySeverities)[number];
type TargetSelection = Partial<Record<KnownTargetKey, boolean>>;

export type EffectiveHarnessModel = {
  allowedDependencies: Record<string, string[]>;
  modules: EffectiveModule[];
  policies: EffectivePolicy[];
  profile: EffectiveProfile;
  project: {
    name: string;
  };
  schemaVersion: 1;
  stack: SupportedStack;
  targets: Record<KnownTargetKey, boolean>;
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

type EffectivePolicy = {
  id: string;
  intent: string;
  severity?: PolicySeverity;
};

type ProfileConfig = {
  defaults: {
    stack?: SupportedStack;
    targets: TargetSelection;
  };
  policies: EffectivePolicy[];
  profile: EffectiveProfile;
  schemaVersion: 1;
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
    modules: moduleMetadata.modules,
    policies: profile.policies,
    profile: profile.profile,
    project: harness.project,
    schemaVersion: 1,
    stack,
    targets: mergeTargets(profile.defaults.targets, harness.targets),
  };
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
  assertKnownKeys(root, ["schemaVersion", "profile", "defaults", "policies"], context, "$");
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
  const policies = parsePolicies(root.policies, context, "policies");

  const defaults: ProfileConfig["defaults"] = { targets };
  if (stack !== undefined) {
    defaults.stack = stack;
  }

  return {
    defaults,
    policies,
    profile,
    schemaVersion: 1,
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

function parsePolicies(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): EffectivePolicy[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw expected(context, fieldPath, "array");
  }

  return value
    .map((policyValue, index): EffectivePolicy => {
      const policyPath = `${fieldPath}[${index}]`;
      const policyRoot = asObject(policyValue, context, policyPath);
      assertKnownKeys(policyRoot, ["id", "intent", "severity"], context, policyPath);

      const policy: EffectivePolicy = {
        id: asIdentifier(policyRoot.id, context, `${policyPath}.id`),
        intent: asNonEmptyString(policyRoot.intent, context, `${policyPath}.intent`),
      };

      const severity = optionalPolicySeverity(
        policyRoot.severity,
        context,
        `${policyPath}.severity`,
      );
      if (severity !== undefined) {
        policy.severity = severity;
      }

      return policy;
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

function optionalPolicySeverity(
  value: unknown,
  context: ValidationContext,
  fieldPath: string,
): PolicySeverity | undefined {
  if (value === undefined) {
    return undefined;
  }

  const severity = asNonEmptyString(value, context, fieldPath);
  if (!isPolicySeverity(severity)) {
    throw new HarnessConfigError(
      `${context.filePath}: ${fieldPath} must be one of: ${supportedPolicySeverities.join(", ")}.`,
    );
  }

  return severity;
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
  return new HarnessConfigError(`${context.filePath}: ${fieldPath} must be a ${expectedType}.`);
}

function isSupportedStack(value: string): value is SupportedStack {
  return (supportedStacks as readonly string[]).includes(value);
}

function isPolicySeverity(value: string): value is PolicySeverity {
  return (supportedPolicySeverities as readonly string[]).includes(value);
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
