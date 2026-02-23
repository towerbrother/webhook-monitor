# Agent Guidelines for webhook-monitor

Monorepo for webhook monitoring system with API, worker, and web frontend.

## Package Manager

**pnpm** (strictly enforced) – Use `pnpm` for all operations, never npm or yarn.

## Workspace Commands

```bash
pnpm dev              # Run all apps in dev mode
pnpm build            # Build all packages (Turborepo)
pnpm lint             # Lint all packages
pnpm format           # Format code with Prettier
pnpm check-types      # TypeScript compiler checks
pnpm test             # Run Vitest tests
```

## Creating Pull Requests

When creating PRs on GitHub:

- **DO NOT disclose agent involvement** – Write as if authored by the repository owner
- **Assign PR to @me** – Set the PR author as the assignee
- **Keep descriptions brief** – 2-4 bullet points summarizing changes
- **Use squash merge** – Enable "Squash and merge" option
- **Delete branch after merge** – Remote branch should be deleted automatically

**Example PR creation:**

```bash
gh pr create \
  --title "feat(api): add webhook retry logic" \
  --body "- Implements exponential backoff retry mechanism
- Adds configurable max retry attempts
- Updates webhook status tracking" \
  --assignee @me
```

## Documentation

- [Architecture & Runtime Boundaries](docs/architecture.md)
- [Code Style & TypeScript](docs/code-style.md)
- [Testing Patterns](docs/testing.md)
- [Contributing Guidelines](docs/contributing.md)
- [Development Setup & Workflows](docs/development.md)
- [Common Tasks & Recipes](docs/recipes.md)

## App-Specific Guidelines

Each app has specific patterns and constraints:

- [apps/api/AGENTS.md](apps/api/AGENTS.md) – Fastify backend API
- [apps/web/AGENTS.md](apps/web/AGENTS.md) – Next.js frontend
- [apps/worker/AGENTS.md](apps/worker/AGENTS.md) – Background job processor

## Package-Specific Guidelines

- [packages/db/AGENTS.md](packages/db/AGENTS.md) – Prisma database client
- [packages/queue/AGENTS.md](packages/queue/AGENTS.md) – BullMQ job queue
