import {
  dependencyCruiserPolicyImplementationContract,
  getDependencyCruiserCommandMetadata,
} from "../integrations/dependency-cruiser.js";
import type { EffectiveHarnessModel } from "../model/effective-model.js";

export type ArchitectureCheckCommand = {
  id: string;
  name: string;
  run: string;
};

type ArchitectureCheckCommandProvider = (
  model: EffectiveHarnessModel,
) => ArchitectureCheckCommand | undefined;

const architectureCheckCommandProviders: ArchitectureCheckCommandProvider[] = [
  getDependencyCruiserCheckCommand,
];

export function getArchitectureCheckCommands(
  model: EffectiveHarnessModel,
): ArchitectureCheckCommand[] {
  return architectureCheckCommandProviders.flatMap((provider) => {
    const command = provider(model);
    return command === undefined ? [] : [command];
  });
}

function getDependencyCruiserCheckCommand(
  model: EffectiveHarnessModel,
): ArchitectureCheckCommand | undefined {
  const shouldRunDependencyCruiser =
    model.targets.dependencyCruiser &&
    model.policies.some((policy) => {
      const implementation = policy.implementation?.[model.stack];
      return (
        model.stack === dependencyCruiserPolicyImplementationContract.stack &&
        policy.id === dependencyCruiserPolicyImplementationContract.policyId &&
        implementation?.engine === dependencyCruiserPolicyImplementationContract.engine &&
        implementation.renderer === dependencyCruiserPolicyImplementationContract.renderer
      );
    });

  if (!shouldRunDependencyCruiser) {
    return undefined;
  }

  const commandMetadata = getDependencyCruiserCommandMetadata(model);

  return {
    id: commandMetadata.engine,
    name: "Run dependency-cruiser architecture checks",
    run: formatShellCommand([
      "npx",
      "--no-install",
      commandMetadata.executable,
      "--config",
      commandMetadata.configFile,
      ...commandMetadata.inputPaths,
    ]),
  };
}

function formatShellCommand(parts: string[]): string {
  return parts.map(formatShellArgument).join(" ");
}

function formatShellArgument(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}
