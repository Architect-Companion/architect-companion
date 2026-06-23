type TargetOutputMetadata = {
  outputPath: string;
};

type TargetMetadata = {
  key: string;
  label: string;
  outputs: readonly TargetOutputMetadata[];
};

export const targetRegistry = [
  {
    key: "agentsMd",
    label: "AGENTS.md",
    outputs: [{ outputPath: "AGENTS.md" }],
  },
  {
    key: "claudeMd",
    label: "CLAUDE.md",
    outputs: [{ outputPath: "CLAUDE.md" }],
  },
  {
    key: "cursor",
    label: "Cursor rules",
    outputs: [{ outputPath: ".cursor/rules/architect-companion.mdc" }],
  },
  {
    key: "dependencyCruiser",
    label: "dependency-cruiser",
    outputs: [{ outputPath: ".dependency-cruiser.cjs" }],
  },
  {
    key: "githubActions",
    label: "GitHub Actions",
    outputs: [{ outputPath: ".github/workflows/architecture.yml" }],
  },
  {
    key: "prAgent",
    label: "PR-Agent review",
    outputs: [
      { outputPath: ".pr_agent.toml" },
      { outputPath: ".github/workflows/pr-agent-review.yml" },
    ],
  },
] as const satisfies readonly TargetMetadata[];

export type KnownTargetKey = (typeof targetRegistry)[number]["key"];
export type TargetRegistryEntry = (typeof targetRegistry)[number];

export const knownTargetKeys: readonly KnownTargetKey[] = targetRegistry.map(
  (target) => target.key,
);

export function getTargetMetadata(target: KnownTargetKey): TargetRegistryEntry {
  const metadata = targetRegistry.find((candidate) => candidate.key === target);
  if (metadata === undefined) {
    throw new Error(`Unknown target key: ${target}`);
  }

  return metadata;
}
