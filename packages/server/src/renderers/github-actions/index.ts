import type { EffectiveHarnessModel } from "@architect-companion/core";

import { RendererBase, type RenderResult } from "../base/renderer.js";

export class GithubActionsRenderer extends RendererBase {
  render(model: EffectiveHarnessModel): RenderResult {
    if (!model.targets.githubActions) {
      return { files: {} };
    }

    const workflow = `name: Architect Check

on:
  push:
    branches: [main]
  pull_request:

jobs:
  architecture:
    name: Architecture Boundary Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Check architecture boundaries
        run: npx --yes dependency-cruiser --config .dependency-cruiser.cjs src
`;

    return { files: { ".github/workflows/architect-check.yml": workflow } };
  }
}
