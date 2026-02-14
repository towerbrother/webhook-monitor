import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Global test settings
    globals: false, // Explicit imports preferred

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.config.ts",
        "**/*.d.ts",
        "**/index.ts", // Entry points are typically re-exports
      ],
    },

    // Environment
    environment: "node",

    // Timeouts
    testTimeout: 30000, // 30s for database tests
    hookTimeout: 30000,

    // Isolation - each test file runs in isolation
    isolate: true,

    // Reporter
    reporters: ["verbose"],

    // Include patterns (will be overridden per workspace)
    include: ["**/*.test.ts"],
  },
});
