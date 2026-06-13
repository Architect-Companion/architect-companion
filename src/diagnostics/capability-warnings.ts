import type { EffectiveHarnessModel, KnownTargetKey } from "../model/effective-model.js";
import { formatPolicyReference } from "../model/effective-model.js";

export type CapabilityWarning = {
  code: CapabilityWarningCode;
  message: string;
  target?: KnownTargetKey;
};

export type CapabilityWarningCode =
  | "dependency-cruiser-implementation-without-target"
  | "dependency-cruiser-target-without-implementation"
  | "github-actions-without-architecture-checks";

export function computeCapabilityWarnings(model: EffectiveHarnessModel): CapabilityWarning[] {
  const warnings: CapabilityWarning[] = [];
  const dependencyCruiserImplementations = model.implementations.filter(
    (implementation) =>
      implementation.engine === "dependency-cruiser" &&
      implementation.renderer === "dependency-cruiser-config",
  );

  if (model.targets.dependencyCruiser && dependencyCruiserImplementations.length === 0) {
    warnings.push({
      code: "dependency-cruiser-target-without-implementation",
      message:
        "dependency-cruiser target is selected but no active implementation uses dependency-cruiser; rendering the target will fail until profiles and project.languages line up.",
      target: "dependencyCruiser",
    });
  }

  const enforceableImplementations = dependencyCruiserImplementations.filter((implementation) => {
    const policy = model.policies.find(
      (candidate) =>
        candidate.sourceProfile === implementation.policy.profile &&
        candidate.id === implementation.policy.id,
    );
    return policy?.severity === "error";
  });

  if (enforceableImplementations.length > 0 && !model.targets.dependencyCruiser) {
    warnings.push({
      code: "dependency-cruiser-implementation-without-target",
      message: `${implementationList(enforceableImplementations)} declared an enforceable dependency-cruiser implementation, but the dependency-cruiser target is not selected; the policy will not be enforced automatically.`,
    });
  }

  if (model.targets.githubActions && !model.targets.dependencyCruiser) {
    warnings.push({
      code: "github-actions-without-architecture-checks",
      message:
        "githubActions target is selected but no external architecture engine target is selected; the generated workflow will only verify generated targets.",
      target: "githubActions",
    });
  }

  return warnings;
}

function implementationList(implementations: EffectiveHarnessModel["implementations"]): string {
  if (implementations.length === 1) {
    return `policy "${formatPolicyReference(implementations[0]?.policy ?? { id: "", profile: "" })}"`;
  }

  return `policies ${implementations
    .map((implementation) => `"${formatPolicyReference(implementation.policy)}"`)
    .join(", ")}`;
}
