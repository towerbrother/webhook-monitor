import { config as reactConfig } from "@repo/eslint-config/react-internal";

export default [
  {
    ignores: ["dist/**", "coverage/**", "eslint.config.js", "vitest.config.ts"],
  },
  ...reactConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
