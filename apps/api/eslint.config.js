import { config as baseConfig } from "@repo/eslint-config/base";

/**
 * ESLint configuration for @repo/api
 * Backend Node.js/Fastify application
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
