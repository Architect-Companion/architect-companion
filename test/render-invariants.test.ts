import { readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { loadEffectiveHarnessModel } from "../src/model/effective-model.js";
import { GENERATED_FILE_MARKER } from "../src/render/generated-file.js";
import { renderEffectiveHarnessModel } from "../src/render/render.js";
import { getTargetMetadata } from "../src/targets/target-registry.js";
import { copyComboProject, profilesDir, renderCombos } from "./support/combos.js";

const requireCjs = createRequire(import.meta.url);

describe("render invariants", () => {
  for (const combo of renderCombos) {
    it(`keeps ${combo.slug} output faithful to its inputs`, async () => {
      const projectDir = copyComboProject(combo.fixtureDir);

      try {
        const model = await loadEffectiveHarnessModel({ profilesDir, projectDir });
        await renderEffectiveHarnessModel({ model, projectDir });

        // (1) Every profile element title survives into the rendered guidance.
        const agentsMd = readFileSync(join(projectDir, "AGENTS.md"), "utf8");
        const titles = [
          ...model.principles,
          ...model.policies,
          ...model.workflows,
          ...model.heuristics,
          ...model.examples,
        ].map((item) => item.title);
        expect(titles.length).toBeGreaterThan(0);
        for (const title of titles) {
          expect(agentsMd, `AGENTS.md is missing "${title}"`).toContain(title);
        }

        // (2) + (3a) Every active dependency-cruiser implementation yields a rule,
        // and the generated config is valid, requireable CommonJS.
        if (combo.enabledTargets.includes("dependencyCruiser")) {
          const cjsPath = join(projectDir, ".dependency-cruiser.cjs");
          const cjs = readFileSync(cjsPath, "utf8");
          const cruiserImpls = model.implementations.filter(
            (impl) => impl.engine === "dependency-cruiser",
          );
          expect(cruiserImpls.length).toBeGreaterThan(0);
          for (const impl of cruiserImpls) {
            const ruleMarker = `architect-companion/${impl.policy.profile}.${impl.policy.id}/`;
            expect(cjs, `dependency-cruiser config is missing rules for ${ruleMarker}`).toContain(
              ruleMarker,
            );
          }

          const config = requireCjs(cjsPath) as {
            forbidden: unknown[];
            options: Record<string, unknown>;
          };
          expect(Array.isArray(config.forbidden)).toBe(true);
          expect(config.forbidden.length).toBeGreaterThan(0);
          expect(typeof config.options).toBe("object");
        }

        // (3b) The generated workflow is valid YAML with the expected shape.
        if (combo.enabledTargets.includes("githubActions")) {
          const workflow = parseYaml(
            readFileSync(join(projectDir, ".github/workflows/architecture.yml"), "utf8"),
          ) as { jobs?: { architecture?: { steps?: unknown } } };
          expect(Array.isArray(workflow.jobs?.architecture?.steps)).toBe(true);
        }

        // (3c) The cursor rules carry valid YAML frontmatter.
        if (combo.enabledTargets.includes("cursor")) {
          const mdc = readFileSync(
            join(projectDir, ".cursor/rules/architect-companion.mdc"),
            "utf8",
          );
          const frontmatter = parseFrontmatter(mdc);
          expect(frontmatter.alwaysApply).toBe(true);
          expect(typeof frontmatter.description).toBe("string");
        }

        // (4) Every generated file is marked and free of coercion artifacts.
        for (const target of combo.enabledTargets) {
          for (const output of getTargetMetadata(target).outputs) {
            const label = output.outputPath;
            const content = readFileSync(join(projectDir, label), "utf8");
            expect(content, `${label} is missing the generated marker`).toContain(
              GENERATED_FILE_MARKER,
            );
            expect(content, `${label} contains [object Object]`).not.toContain("[object Object]");
            expect(/\bNaN\b/.test(content), `${label} contains NaN`).toBe(false);
            if (label.endsWith(".md") || label.endsWith(".mdc")) {
              assertNoUndefinedFields(content, label);
            } else {
              expect(content, `${label} contains a bare undefined`).not.toContain("undefined");
            }
          }
        }
      } finally {
        rmSync(projectDir, { force: true, recursive: true });
      }
    });
  }
});

function parseFrontmatter(mdc: string): { alwaysApply?: unknown; description?: unknown } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(mdc);
  if (match === null || match[1] === undefined) {
    throw new Error("cursor rules are missing YAML frontmatter");
  }
  return parseYaml(match[1]) as { alwaysApply?: unknown; description?: unknown };
}

// A missing field coerced into a structural line shows up as a literal "undefined".
// Restricted to structural lines so fenced TypeScript examples may legitimately
// mention `undefined`.
function assertNoUndefinedFields(content: string, label: string): void {
  const offenders = content
    .split("\n")
    .filter(
      (line) =>
        /^#{2,4}\s+undefined\s*$/.test(line) ||
        /^(Source|Severity|Intent|Project|Languages|Public API|Allowed dependencies):\s*undefined\b/.test(
          line,
        ),
    );
  expect(offenders, `${label} has undefined structural fields: ${offenders.join(" | ")}`).toEqual(
    [],
  );
}
