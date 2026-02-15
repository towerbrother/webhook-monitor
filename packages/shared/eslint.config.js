import { config as baseConfig } from "@repo/eslint-config/base";

/**
 * ESLint configuration for @repo/shared
 * Shared utilities and types
 */
export default [
  {
    ignores: ["dist/**", "coverage/**", "eslint.config.js", "vitest.config.ts"],
  },
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
