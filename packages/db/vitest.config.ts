import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@repo/db",
    environment: "node",

    // Database tests need longer timeouts
    testTimeout: 30000,
    hookTimeout: 30000,

    // Run tests sequentially to avoid database conflicts
    sequence: {
      concurrent: false,
    },

    // Include patterns
    include: ["src/**/*.test.ts"],

    // Setup file for database connection
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
