# Common Tasks & Recipes

## Adding a New Shared Package

1. Create directory in `packages/new-package/`
2. Add `package.json` with `"name": "@repo/new-package"`
3. Add `tsconfig.json` extending `@repo/typescript-config/base.json`
4. Export from `index.ts` or `src/index.ts`
5. Run `pnpm install` at root to link workspace

## Adding a Database Model

1. Edit `packages/db/prisma/schema.prisma`
2. Run `pnpm --filter @repo/db prisma generate`
3. Run migrations (when configured)

See [packages/db/AGENTS.md](../packages/db/AGENTS.md) for more details.

## Adding a Background Job

1. Define job in `packages/queue`
2. Enqueue from `apps/api`
3. Process in `apps/worker`

See [packages/queue/AGENTS.md](../packages/queue/AGENTS.md) for job patterns.

## Adding an API Endpoint

1. Create route handler in `apps/api/src/routes/`
2. Register route in `apps/api/src/index.ts`
3. Use Fastify patterns (async handlers, validation, etc.)

See [apps/api/AGENTS.md](../apps/api/AGENTS.md) for API-specific patterns.
