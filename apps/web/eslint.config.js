import { nextJsConfig } from "@repo/eslint-config/next-js";

/**
 * ESLint configuration for @repo/web
 * Next.js frontend application
 */
export default [
  {
    ignores: ["eslint.config.js", ".next/**"],
  },
  ...nextJsConfig,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
