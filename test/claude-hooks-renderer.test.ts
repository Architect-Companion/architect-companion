import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadEffectiveHarnessModel } from "../src/model/effective-model.js";
import { GENERATED_FILE_MARKER } from "../src/render/generated-file.js";
import {
  claudeHooks,
  claudeHookScriptPaths,
  CLAUDE_SETTINGS_PATH,
  hookRenderers,
  renderClaudeHooksTarget,
  renderClaudeSettings,
  renderGeneratedFileGuard,
  renderSettingsForHooks,
  type ClaudeHook,
} from "../src/renderers/claude-hooks.js";
import { getTargetMetadata } from "../src/targets/target-registry.js";

const profilesDir = fileURLToPath(new URL("../profiles", import.meta.url));
const cliProjectDir = fileURLToPath(new URL("fixtures/projects/cli-ts", import.meta.url));

type ParsedSettings = {
  "//": string;
  hooks: Record<string, { hooks: { command: string; type: string }[]; matcher?: string }[]>;
};

type GuardDecision = {
  hookSpecificOutput: {
    permissionDecision: string;
    permissionDecisionReason: string;
  };
};

function runGuard(scriptPath: string, payload: unknown): string {
  return execFileSync("node", [scriptPath], {
    encoding: "utf8",
    input: JSON.stringify(payload),
  });
}

describe("renderSettingsForHooks", () => {
  it("assembles any catalog generically, grouping by event and preserving matchers", () => {
    const synthetic: ClaudeHook[] = [
      { id: "alpha", event: "PreToolUse", matcher: "Edit|Write", renderer: "generated-file-guard" },
      { id: "beta", event: "PreToolUse", matcher: "Bash", renderer: "generated-file-guard" },
      { id: "gamma", event: "UserPromptSubmit", renderer: "generated-file-guard" },
    ];

    const parsed = JSON.parse(renderSettingsForHooks(synthetic)) as ParsedSettings;
    expect(parsed["//"]).toBe(GENERATED_FILE_MARKER);

    // Two hooks on the same event produce two entries, each with its own matcher
    // and a command that points at its own <id>.mjs script.
    expect(parsed.hooks.PreToolUse).toHaveLength(2);
    expect(parsed.hooks.PreToolUse?.[0]?.matcher).toBe("Edit|Write");
    expect(parsed.hooks.PreToolUse?.[0]?.hooks[0]?.command).toContain("alpha.mjs");
    expect(parsed.hooks.PreToolUse?.[1]?.matcher).toBe("Bash");
    expect(parsed.hooks.PreToolUse?.[1]?.hooks[0]?.command).toContain("beta.mjs");

    // A non-tool event carries no matcher.
    expect(parsed.hooks.UserPromptSubmit).toHaveLength(1);
    expect(parsed.hooks.UserPromptSubmit?.[0]?.matcher).toBeUndefined();
    expect(parsed.hooks.UserPromptSubmit?.[0]?.hooks[0]?.command).toContain("gamma.mjs");

    // Event order is fixed (PreToolUse before UserPromptSubmit) for determinism.
    expect(Object.keys(parsed.hooks)).toEqual(["PreToolUse", "UserPromptSubmit"]);
  });
});

describe("renderClaudeSettings", () => {
  it("renders a marked, valid settings.json wiring the shipped guard", () => {
    const settings = renderClaudeSettings();
    expect(settings).toContain(GENERATED_FILE_MARKER);

    const parsed = JSON.parse(settings) as ParsedSettings;
    // JSON has no comments, so the marker rides in a top-level "//" key.
    expect(parsed["//"]).toBe(GENERATED_FILE_MARKER);

    const guard = parsed.hooks.PreToolUse?.[0];
    expect(guard?.matcher).toBe("Edit|Write|MultiEdit|NotebookEdit");

    const command = guard?.hooks[0];
    expect(command?.type).toBe("command");
    expect(command?.command).toContain("$CLAUDE_PROJECT_DIR");
    expect(command?.command).toContain(".claude/hooks/guard-generated-files.mjs");
  });
});

describe("renderGeneratedFileGuard", () => {
  it("carries the generated-file marker on its first line", () => {
    const firstLine = renderGeneratedFileGuard().split("\n")[0] ?? "";
    expect(firstLine).toContain(GENERATED_FILE_MARKER);
  });

  it("denies edits to generated files and allows everything else", () => {
    const dir = mkdtempSync(join(tmpdir(), "architect-companion-guard-"));

    try {
      const scriptPath = join(dir, "guard.mjs");
      writeFileSync(scriptPath, renderGeneratedFileGuard(), "utf8");

      const generatedFile = join(dir, "CLAUDE.md");
      writeFileSync(generatedFile, `<!-- ${GENERATED_FILE_MARKER} -->\n# generated\n`, "utf8");

      const handWrittenFile = join(dir, "notes.md");
      writeFileSync(handWrittenFile, "# hand written\n", "utf8");

      // A generated file is denied, and the reason points back at the source.
      const denied = runGuard(scriptPath, {
        tool_name: "Edit",
        tool_input: { file_path: generatedFile },
      });
      const decision = JSON.parse(denied) as GuardDecision;
      expect(decision.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(decision.hookSpecificOutput.permissionDecisionReason).toContain(generatedFile);
      expect(decision.hookSpecificOutput.permissionDecisionReason).toContain(
        ".architect-companion/",
      );

      // A hand-written file is allowed (no decision emitted).
      expect(
        runGuard(scriptPath, {
          tool_name: "Edit",
          tool_input: { file_path: handWrittenFile },
        }).trim(),
      ).toBe("");

      // Creating a new file (nothing on disk yet) is allowed.
      expect(
        runGuard(scriptPath, {
          tool_name: "Write",
          tool_input: { file_path: join(dir, "does-not-exist.md") },
        }).trim(),
      ).toBe("");
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});

describe("renderClaudeHooksTarget", () => {
  it("renders settings.json plus one script per catalog hook", async () => {
    const model = await loadEffectiveHarnessModel({ profilesDir, projectDir: cliProjectDir });
    const outputs = renderClaudeHooksTarget(model);

    expect(outputs).toHaveLength(1 + claudeHooks.length);
    expect(outputs[0]).toBe(renderClaudeSettings());
    expect(outputs.slice(1)).toEqual(
      claudeHooks.map((hook) => hookRenderers[hook.renderer](model)),
    );
  });

  it("keeps the target registry outputs in sync with the catalog", () => {
    const declared = getTargetMetadata("claudeHooks").outputs.map((output) => output.outputPath);
    expect(declared).toEqual([CLAUDE_SETTINGS_PATH, ...claudeHookScriptPaths()]);
  });

  it("declares only hooks backed by a registered renderer", () => {
    for (const hook of claudeHooks) {
      expect(Object.keys(hookRenderers)).toContain(hook.renderer);
    }
  });
});
