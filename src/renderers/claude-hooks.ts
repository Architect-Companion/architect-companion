import type { EffectiveHarnessModel } from "../model/effective-model.js";
import { GENERATED_FILE_MARKER } from "../render/generated-file.js";

export const CLAUDE_SETTINGS_PATH = ".claude/settings.json";
export const CLAUDE_HOOKS_DIR = ".claude/hooks";

/**
 * The Claude Code hook events Architect Companion can render, in the order they
 * appear in the generated `settings.json`. Fixing the order here keeps rendering
 * deterministic regardless of catalog order.
 */
export const CLAUDE_HOOK_EVENTS = ["PreToolUse", "PostToolUse", "UserPromptSubmit"] as const;

export type ClaudeHookEvent = (typeof CLAUDE_HOOK_EVENTS)[number];

/**
 * Identifies a built-in hook renderer — the code that produces a hook's script
 * body. This is the analogue of a policy `engine`/`renderer` key: declarations
 * reference a renderer by this key, so a hook can be described entirely as data
 * (id + event + matcher + renderer key) without naming a function. That keeps
 * the door open to sourcing declarations from the harness or profiles later,
 * while the script-producing code stays built into Architect Companion.
 */
export type ClaudeHookRendererKey = "generated-file-guard";

/**
 * A hook renderer turns the effective model into a script body. Most renderers
 * will be parameterised by the model (boundaries, policies); the generated-file
 * guard happens to need nothing, which is why it ignores the argument.
 */
export type ClaudeHookRenderer = (model: EffectiveHarnessModel) => string;

/**
 * The built-in renderer registry. Adding a new *kind* of hook means adding one
 * entry here (and its key to {@link ClaudeHookRendererKey}); adding an instance
 * of an existing kind means adding a declaration to {@link claudeHooks}.
 */
export const hookRenderers: Record<ClaudeHookRendererKey, ClaudeHookRenderer> = {
  "generated-file-guard": renderGeneratedFileGuard,
};

/**
 * A hook declaration: the data half of a hook. The renderer assembly only reads
 * `event`/`matcher`/`id` from this; the `renderer` key selects the built-in code
 * that produces the script. This mirrors a policy implementation binding a
 * policy to an engine.
 */
export type ClaudeHook = {
  /** Stable id; also the basename of the rendered script (`<id>.mjs`). */
  id: string;
  event: ClaudeHookEvent;
  /** Tool matcher for tool events (e.g. "Edit|Write"); omitted for others. */
  matcher?: string;
  renderer: ClaudeHookRendererKey;
};

/**
 * The active hook declarations. These are Architect Companion's built-in,
 * always-on hooks — today just the generated-file guard, which protects AC's own
 * output and so belongs to no profile. When harness- or profile-declared hooks
 * are introduced, they merge in here, filtered like policy implementations.
 */
export const claudeHooks: readonly ClaudeHook[] = [
  {
    id: "guard-generated-files",
    event: "PreToolUse",
    matcher: "Edit|Write|MultiEdit|NotebookEdit",
    renderer: "generated-file-guard",
  },
];

type ClaudeHookCommand = {
  command: string;
  type: "command";
};

type ClaudeHookSettingsEntry = {
  hooks: ClaudeHookCommand[];
  matcher?: string;
};

type ClaudeSettings = {
  "//": string;
  hooks: Partial<Record<ClaudeHookEvent, ClaudeHookSettingsEntry[]>>;
};

/**
 * Renders the Claude Code hooks target. Outputs are, in registry order, the
 * `.claude/settings.json` configuration followed by each active hook's script.
 * Architect Companion only renders these files; Claude Code executes the hooks
 * inside its own agent loop.
 */
export function renderClaudeHooksTarget(model: EffectiveHarnessModel): readonly string[] {
  return [
    renderClaudeSettings(),
    ...claudeHooks.map((hook) => hookRenderers[hook.renderer](model)),
  ];
}

/** The script output paths the active hooks produce, in catalog order. */
export function claudeHookScriptPaths(): readonly string[] {
  return claudeHooks.map(hookScriptPath);
}

/**
 * Renders `.claude/settings.json` from the active hooks. JSON has no comments,
 * so the generated-file marker rides in a top-level `"//"` key; Claude Code
 * ignores unknown keys, and the renderer reads it back when verifying freshness.
 */
export function renderClaudeSettings(): string {
  return renderSettingsForHooks(claudeHooks);
}

/**
 * The pure settings assembly: groups any set of hook declarations by event into
 * the shape Claude Code expects. Exposed for testing with synthetic catalogs so
 * multi-hook, multi-event behaviour can be exercised without the shipped set.
 */
export function renderSettingsForHooks(hooks: readonly ClaudeHook[]): string {
  const entriesByEvent = new Map<ClaudeHookEvent, ClaudeHookSettingsEntry[]>();
  for (const hook of hooks) {
    const entry: ClaudeHookSettingsEntry = {
      hooks: [{ type: "command", command: hookCommand(hook) }],
    };
    if (hook.matcher !== undefined) {
      entry.matcher = hook.matcher;
    }

    const existing = entriesByEvent.get(hook.event) ?? [];
    existing.push(entry);
    entriesByEvent.set(hook.event, existing);
  }

  const settings: ClaudeSettings = { "//": GENERATED_FILE_MARKER, hooks: {} };
  for (const event of CLAUDE_HOOK_EVENTS) {
    const entries = entriesByEvent.get(event);
    if (entries !== undefined) {
      settings.hooks[event] = entries;
    }
  }

  return `${JSON.stringify(settings, null, 2)}\n`;
}

function hookScriptPath(hook: ClaudeHook): string {
  return `${CLAUDE_HOOKS_DIR}/${hook.id}.mjs`;
}

function hookCommand(hook: ClaudeHook): string {
  return `node "$CLAUDE_PROJECT_DIR/${hookScriptPath(hook)}"`;
}

/**
 * The generated-file guard renderer. Claude Code pipes the tool call as JSON on
 * stdin before an Edit/Write/MultiEdit/NotebookEdit; the script denies the call
 * when the target file carries the generated-file marker. The marker is the only
 * signal it uses, so it protects every file Architect Companion generates
 * without the list of output paths baked in.
 */
export function renderGeneratedFileGuard(): string {
  return `// ${GENERATED_FILE_MARKER}
//
// Architect Companion PreToolUse guard for Claude Code.
//
// Claude Code runs this before an Edit/Write/MultiEdit/NotebookEdit tool call,
// piping the call as JSON on stdin. The guard denies the call when the target
// file already carries the generated-file marker: such files are owned by
// \`architect-companion render\` and hand-edits are silently overwritten. Change
// the source under .architect-companion/ and re-render instead.
import { readFileSync } from "node:fs";

const MARKER = ${JSON.stringify(GENERATED_FILE_MARKER)};

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parsePayload(raw) {
  if (raw.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function targetPath(payload) {
  const toolInput = payload.tool_input ?? {};
  return toolInput.file_path ?? toolInput.notebook_path ?? "";
}

function isGenerated(filePath) {
  if (!filePath) {
    return false;
  }
  try {
    return readFileSync(filePath, "utf8").includes(MARKER);
  } catch {
    return false;
  }
}

const filePath = targetPath(parsePayload(readStdin()));

if (isGenerated(filePath)) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          filePath +
          " is generated by Architect Companion. Edit the source under " +
          ".architect-companion/ and run 'architect-companion render' instead of " +
          "editing this generated file directly.",
      },
    }) + "\\n",
  );
}
`;
}
