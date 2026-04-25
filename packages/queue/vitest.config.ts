import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    // Timeout for Redis operations
    testTimeout: 10000,
  },
});
