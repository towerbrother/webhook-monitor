# Agent Guidelines for webhook-monitor

This document defines how coding agents should interact with this codebase.

## General Behavior

- **Prefer deletion over addition** – Remove unused code, dependencies, and files
- **Keep changes minimal and scoped** – One concern per change
- **Do not introduce new tools or frameworks** unless explicitly requested
- **Do not refactor unrelated code** – Stay focused on the task
- **Do not "improve" things that were not asked for** – No premature optimization
- **Update documentation if behavior changes** – Keep README.md and comments current

## Architecture Rules

### Workspace Structure

```arch
apps/
├── api/       # Fastify backend API (HTTP endpoints only)
├── web/       # Next.js frontend application
└── worker/    # Background job processor (no HTTP)

packages/
├── db/        # Prisma database client (PostgreSQL)
├── queue/     # BullMQ job queue (Redis)
├── shared/    # Shared utilities and types
├── eslint-config/     # ESLint configurations
└── typescript-config/ # TypeScript configurations
```

### Runtime Boundaries

- **apps/api**, **apps/worker**, **apps/web** are runtime boundaries
- **No cross-app imports** – Apps cannot import from other apps
- **Shared code lives only in packages/** – Extract to packages if needed by multiple apps
- **API must never perform background work** – Enqueue jobs to worker instead
- **Worker must never expose HTTP** – Use API for external communication

### Infrastructure

- **PostgreSQL** – Database (via Prisma ORM in packages/db)
- **Redis** – Cache and job queue (via BullMQ in packages/queue)
- **Expected local setup** – Database URL: `postgresql://postgres:postgres@localhost:5432/webhook_monitor`
- **No Docker configuration in repo** – Run services locally or use external infrastructure

## Tooling

### Package Manager

- **pnpm 9.0.0** (strictly enforced via packageManager field)
- **pnpm workspaces** – All packages defined in pnpm-workspace.yaml
- **Never use npm or yarn** – Use pnpm for all operations

### Build System

- **Turborepo 2.7.6+** for task orchestration
- **Dependency-aware builds** – Turborepo respects ^build dependencies
- **Caching enabled** for build/lint/check-types tasks

### Commands

```bash
# Development
pnpm dev              # Run all apps in dev mode (persistent, no cache)
pnpm build            # Build all packages (cached, dependency order)
pnpm lint             # Lint all packages with ESLint
pnpm format           # Format code with Prettier (*.ts, *.tsx, *.md)
pnpm check-types      # Run TypeScript compiler checks

# Per-package commands (from package root)
pnpm --filter @repo/api dev        # Run only API in dev mode
pnpm --filter @repo/web build      # Build only web app
```

### Testing

**Status: No test framework configured**

When tests are added:

- Use Vitest
- Place tests adjacent to source: `src/foo.ts` → `src/foo.test.ts`
- Run single test: `pnpm test -- path/to/file.test.ts`
- Run tests in watch mode: `pnpm test --watch`

## Code Style

### TypeScript

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

### Imports

- **Use named imports** when possible: `import { foo } from 'bar'`
- **Use default imports** for default exports: `import React from 'react'`
- **Absolute imports within packages** – Configure via tsconfig paths if needed
- **No relative imports across package boundaries** – Use workspace references

### Formatting

- **Prettier** handles all formatting (80 char default)
- **Run `pnpm format` before committing**
- **No manual formatting in ESLint** – ESLint checks logic, Prettier handles style

### Naming Conventions

- **PascalCase** – Components, classes, types, interfaces
- **camelCase** – Functions, variables, methods
- **UPPER_CASE** – Constants (e.g., `MAX_RETRIES`)
- **kebab-case** – File names (e.g., `webhook-handler.ts`)
- **Prefix interfaces with I** – Optional but consistent if used

### React Patterns

- **New JSX transform** – No need to `import React` in every file
- **Functional components** preferred over class components
- **Hooks** – Follow React Hooks rules (enforced by eslint-plugin-react-hooks)
- **Next.js conventions** – Use App Router patterns for apps/web

### Error Handling

- **Use async/await** – Prefer over .then()/.catch()
- **Try/catch for async operations** – Handle errors explicitly
- **Typed errors** – Define error classes or use discriminated unions
- **Fastify error handlers** – Use Fastify's built-in error handling in API
- **Log errors with context** – Include relevant data for debugging

### ESLint

- **All errors are warnings** – Via eslint-plugin-only-warn (dev-friendly)
- **ESLint flat config format** (ESLint 9.x) – Not .eslintrc
- **Three configs available**:
  - `@repo/eslint-config/base` – Backend/Node.js packages
  - `@repo/eslint-config/next` – Next.js apps
  - `@repo/eslint-config/react-internal` – React libraries
- **Turbo env var checking** – Warns about undeclared environment variables

## Change Discipline

### One Concern Per Change

- **Single purpose commits** – One feature, one fix, one refactor
- **Atomic changes** – Each commit should leave the codebase in a working state
- **Descriptive commit messages** – Explain why, not what

### Documentation

- **Update README.md** if scripts or structure change
- **Update AGENTS.md** if patterns or rules change
- **Add JSDoc comments** for public APIs
- **Environment variables** – Document in .env.example files

### Configuration Over Convention

- **Explicit configuration** – Prefer explicit over implicit
- **Shared configs** – Use packages/eslint-config and packages/typescript-config
- **Environment variables** – Use .env files, document all variables
- **No magic values** – Define constants for repeated values

## What NOT to Do

- **No premature optimization** – Profile before optimizing
- **No microservices** – This is a monorepo with runtime boundaries, not separate services
- **No infrastructure-as-code** unless explicitly requested (e.g., Terraform, Pulumi)
- **No new frameworks** – Stick to Fastify (API), Next.js (web), Prisma (DB), BullMQ (queue)
- **No global state in workers** – Workers should be stateless
- **No business logic in API routes** – Extract to services/handlers
- **No direct database queries in API** – Use packages/db and Prisma
- **No frontend API calls in server components** – Use Next.js server-side data fetching

## Common Tasks

### Adding a New Shared Package

1. Create directory in `packages/new-package/`
2. Add `package.json` with `"name": "@repo/new-package"`
3. Add `tsconfig.json` extending `@repo/typescript-config/base.json`
4. Export from `index.ts` or `src/index.ts`
5. Run `pnpm install` at root to link workspace

### Adding a Database Model

1. Edit `packages/db/prisma/schema.prisma`
2. Run `pnpm --filter @repo/db prisma generate`
3. Run migrations (when configured)

### Adding a Background Job

1. Define job in `packages/queue`
2. Enqueue from `apps/api`
3. Process in `apps/worker`

### Adding an API Endpoint

1. Create route handler in `apps/api/src/routes/`
2. Register route in `apps/api/src/index.ts`
3. Use Fastify patterns (async handlers, validation, etc.)

## Node.js Version

- **Node.js >= 18** required (specified in package.json engines)
- **Use latest LTS** recommended for development
