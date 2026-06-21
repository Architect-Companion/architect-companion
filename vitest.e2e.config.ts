import { defineConfig } from "vitest/config";

// End-to-end tests spawn the built dist/cli.js as a real process. They are kept
// out of the fast unit run (test/**/*.test.ts) and require a fresh build first;
// `npm run test:e2e` builds before invoking this config.
export default defineConfig({
  server: {
    host: "127.0.0.1",
  },
  test: {
    include: ["test/**/*.e2e.ts"],
  },
});
