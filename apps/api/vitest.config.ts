import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
    setupFiles: ["src/__tests__/setup.ts"],
    // Sequential execution for database tests
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
