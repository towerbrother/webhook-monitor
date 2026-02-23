# Code Style

## TypeScript

- **Strict mode enabled** – No implicit any, strict null checks, etc.
- **noUncheckedIndexedAccess: true** – Array/object access returns `T | undefined`
- **Target: ES2022** – Use modern JavaScript features
- **Module system: ESM** – Use `import`/`export`, not `require`
- **Node.js resolution: NodeNext** – Proper ESM support for backend packages
- **Bundler resolution for Next.js** – Frontend uses bundler-specific resolution

### TypeScript Configurations

- **Backend packages** – Extend `@repo/typescript-config/base.json`
- **Next.js apps** – Extend `@repo/typescript-config/nextjs.json`
- **React libraries** – Extend `@repo/typescript-config/react-library.json`

## Imports

- **No relative imports across package boundaries** – Use workspace references

## Formatting

- **Prettier** handles all formatting (80 char default)
- **Run `pnpm format` before committing**
- **No manual formatting in ESLint** – ESLint checks logic, Prettier handles style

## Naming Conventions

- **PascalCase** – Components, classes, types, interfaces
- **camelCase** – Functions, variables, methods
- **UPPER_CASE** – Constants (e.g., `MAX_RETRIES`)
- **kebab-case** – File names (e.g., `webhook-handler.ts`)
- **Prefix interfaces with I** – Optional but consistent if used

## Error Handling

- **Try/catch for async operations** – Handle errors explicitly
- **Typed errors** – Define error classes or use discriminated unions
- **Log errors with context** – Include relevant data for debugging

## ESLint

- **All errors are warnings** – Via eslint-plugin-only-warn (dev-friendly)
- **ESLint flat config format** (ESLint 9.x) – Not .eslintrc
- **Three configs available**:
  - `@repo/eslint-config/base` – Backend/Node.js packages
  - `@repo/eslint-config/next` – Next.js apps
  - `@repo/eslint-config/react-internal` – React libraries
- **Turbo env var checking** – Warns about undeclared environment variables
