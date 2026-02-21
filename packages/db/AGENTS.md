# Database Package Guidelines

Prisma database client for webhook-monitor.

See [root AGENTS.md](../../AGENTS.md) for shared guidelines.

## Responsibilities

- **Prisma schema** – Define database models in `prisma/schema.prisma`
- **Type-safe database client** – Export generated Prisma client
- **Migrations** – Manage database schema changes

## Working with Prisma

### Schema Changes

1. Edit `prisma/schema.prisma`
2. Run `pnpm --filter @repo/db prisma generate` to regenerate client
3. Create and apply migrations (when configured)

### Database URL

- Expected: `postgresql://postgres:postgres@localhost:5432/webhook_monitor`
- Configure via `DATABASE_URL` environment variable

## Exporting Client

- Export Prisma client instance from package root
- Apps import via `@repo/db`
- Do not instantiate multiple Prisma clients
