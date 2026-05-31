import { dependencyCruiserPolicyImplementationContract } from "../integrations/dependency-cruiser.js";
import type { EffectiveHarnessModel, KnownTargetKey } from "../model/effective-model.js";

export type CapabilityWarning = {
  code: CapabilityWarningCode;
  message: string;
  target?: KnownTargetKey;
};

export type CapabilityWarningCode =
  | "dependency-cruiser-target-without-policy"
  | "dependency-cruiser-policy-without-target"
  | "github-actions-without-architecture-checks"
  | "policy-without-stack-implementation";

export function computeCapabilityWarnings(model: EffectiveHarnessModel): CapabilityWarning[] {
  const warnings: CapabilityWarning[] = [];
  const dependencyCruiserPolicies = model.policies.filter(
    (policy) => policy.implementation?.[model.stack]?.engine === "dependency-cruiser",
  );

  if (model.targets.dependencyCruiser && dependencyCruiserPolicies.length === 0) {
    warnings.push({
      code: "dependency-cruiser-target-without-policy",
      message:
        "dependency-cruiser target is selected but no policy declares a dependency-cruiser implementation for the selected stack; the generated config will not enforce any rules.",
      target: "dependencyCruiser",
    });
  }

  const enforceablePolicies = dependencyCruiserPolicies.filter(
    (policy) => policy.severity === "error",
  );
  if (enforceablePolicies.length > 0 && !model.targets.dependencyCruiser) {
    warnings.push({
      code: "dependency-cruiser-policy-without-target",
      message: `${policyList(enforceablePolicies)} declared an enforceable dependency-cruiser implementation, but the dependency-cruiser target is not selected; the policy will not be enforced automatically.`,
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

  for (const policy of model.policies) {
    const implementation = policy.implementation;
    if (implementation === undefined) {
      continue;
    }

    if (implementation[model.stack] === undefined) {
      warnings.push({
        code: "policy-without-stack-implementation",
        message: `policy "${policy.id}" has no implementation for the selected stack "${model.stack}"; it cannot be enforced automatically.`,
      });
    }
  }

  // dependency-cruiser implementation contract is currently only available for typescript;
  // ensure the future readiness contract is not silently broken by selecting an unsupported stack.
  if (
    model.targets.dependencyCruiser &&
    model.stack !== dependencyCruiserPolicyImplementationContract.stack
  ) {
    warnings.push({
      code: "policy-without-stack-implementation",
      message: `dependency-cruiser target is selected but the dependency-cruiser engine has no contract for the "${model.stack}" stack; only "${dependencyCruiserPolicyImplementationContract.stack}" is supported.`,
      target: "dependencyCruiser",
    });
  }

  return warnings;
}

function policyList(policies: EffectiveHarnessModel["policies"]): string {
  if (policies.length === 1) {
    return `policy "${policies[0]?.id ?? ""}"`;
  }

  return `policies ${policies.map((policy) => `"${policy.id}"`).join(", ")}`;
}
