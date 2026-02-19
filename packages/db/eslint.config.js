import { config as baseConfig } from "@repo/eslint-config/base";

/**
 * ESLint configuration for @repo/db
 * Prisma database client package
 */
export default [
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "prisma/migrations/**",
      "eslint.config.js",
      "vitest.config.ts",
      "prisma.config.ts",
      "scripts/**",
    ],
  },
  ...baseConfig,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
