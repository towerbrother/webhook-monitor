import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env files from both api and db packages
config({ path: resolve(__dirname, ".env") });
config({ path: resolve(__dirname, "../../packages/db/.env") });

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
