import type { EffectiveHarnessModel } from "@architect-companion/core";

export type RenderResult = {
  files: Record<string, string>;
};

export abstract class RendererBase {
  abstract render(model: EffectiveHarnessModel): RenderResult;
}
