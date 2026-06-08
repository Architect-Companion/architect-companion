import type { EffectiveHarnessModel } from "../model/effective-model.js";
import { MARKDOWN_GENERATED_HEADER } from "../render/generated-file.js";
import { renderMarkdownGuidanceBody } from "./markdown-guidance.js";

export function renderAgentsMd(model: EffectiveHarnessModel): string {
  return `${MARKDOWN_GENERATED_HEADER}

# Agent Instructions

${renderMarkdownGuidanceBody(model)}`;
}

export function renderClaudeMd(model: EffectiveHarnessModel): string {
  return `${MARKDOWN_GENERATED_HEADER}

# Claude Instructions

${renderMarkdownGuidanceBody(model)}`;
}

export function renderCursorRules(model: EffectiveHarnessModel): string {
  return `---
description: Generated architecture guidance from Architect Companion
alwaysApply: true
---
${MARKDOWN_GENERATED_HEADER}

# Architect Companion Guidance

${renderMarkdownGuidanceBody(model)}`;
}
