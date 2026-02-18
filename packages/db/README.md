# @repo/db

Prisma database client for webhook-monitor.

## Setup

### Prerequisites

- PostgreSQL running (via Docker or locally)
- Redis running (via Docker or locally)

### Quick Start

```bash
# Start infrastructure (from repository root)
docker compose up -d

# Setup test database (automatically runs on `pnpm test`)
pnpm --filter @repo/db db:setup

# Run migrations on development database
pnpm --filter @repo/db db:migrate

# Run tests
pnpm --filter @repo/db test
```

## Database Configuration

This package manages two databases in the same PostgreSQL instance:

- **webhook_monitor** - Development/production database
- **webhook_monitor_test** - Test database (automatically created by `db:setup`)

### Environment Variables

Create a `.env` file in `packages/db/`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/webhook_monitor?schema=public"
```

For tests, the URL is automatically set to `webhook_monitor_test` database.

## Scripts

- `pnpm generate` - Generate Prisma client
- `pnpm db:setup` - Create and migrate test database
- `pnpm db:migrate` - Run migrations on development database
- `pnpm db:push` - Push schema changes without migrations (dev only)
- `pnpm db:studio` - Open Prisma Studio
- `pnpm test` - Run tests (automatically sets up test DB first)
- `pnpm test:watch` - Run tests in watch mode

## Troubleshooting

### Tests fail with "ECONNREFUSED"

PostgreSQL is not running. Start it with:

```bash
# From repository root
docker compose up -d
```

### Tests fail with "Invalid invocation" or "database does not exist"

The test database hasn't been created. Run:

```bash
pnpm --filter @repo/db db:setup
```

This is automatically run before tests via the `pretest` script, but you can run it manually if needed.

### Migrations are out of sync

Reset the test database:

```bash
# Drop and recreate test database
docker exec webhook-monitor-postgres psql -U postgres -c "DROP DATABASE IF EXISTS webhook_monitor_test;"
pnpm --filter @repo/db db:setup
```

## Architecture

This package uses:

- **Prisma 7.x** with PostgreSQL driver adapter
- **@prisma/adapter-pg** for connection pooling
- **pg** package for PostgreSQL connections

The client is configured in `src/index.ts` and requires an adapter when using the Prisma client engine.

## Testing

Tests use Vitest and include:

- **Domain tests** (`src/__tests__/domain.test.ts`) - Business logic functions
- **Schema tests** (`src/__tests__/schema.test.ts`) - Database constraints and relationships

Test setup in `src/__tests__/setup.ts`:

- Connects to test database before tests
- Cleans database before each test (test isolation)
- Disconnects after all tests complete

## Development

### Adding a new model

1. Edit `prisma/schema.prisma`
2. Create migration: `pnpm db:migrate`
3. Generate client: `pnpm generate`
4. Add domain functions in `src/domain.ts` if needed
5. Add tests in `src/__tests__/`

### Running tests

```bash
# Run once
pnpm test

# Watch mode
pnpm test:watch

# With query logging
# Edit src/__tests__/setup.ts and set logQueries: true
```
