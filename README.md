# webhook-monitor

A Turborepo monorepo for webhook monitoring with automated dependency management and CI/CD.

## Prerequisites

- Node.js >= 24.13.1
- pnpm 10.28.2 (exact version, enforced)
- Docker (for PostgreSQL and Redis)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL + Redis)
docker compose up -d

# Setup databases (creates test DB and runs migrations)
pnpm db:setup

# Start all development servers
pnpm dev
```

## Scripts

```bash
pnpm dev          # Run all apps in dev mode
pnpm build        # Build all packages
pnpm lint         # Lint all packages
pnpm format       # Format code with Prettier
pnpm check-types  # Run TypeScript checks
pnpm db:setup     # Setup databases (start Docker + create test DB)
pnpm test         # Run all tests
```

## Documentation

Comprehensive documentation is available in the [`docs/`](./docs) directory:

- **[docs/README.md](./docs/README.md)** - Documentation index
- **[docs/automation.md](./docs/automation.md)** - Renovate, CI/CD, branch protection
- **[docs/infrastructure.md](./docs/infrastructure.md)** - Deployment, database, monitoring
- **[docs/workflows.md](./docs/workflows.md)** - Git strategy, PR process, development

### Quick Links

| Topic                | Document                                                                  |
| -------------------- | ------------------------------------------------------------------------- |
| Setting up Renovate  | [docs/automation.md](./docs/automation.md#dependency-management-renovate) |
| Deployment strategy  | [docs/infrastructure.md](./docs/infrastructure.md#deployment-strategy)    |
| Pull request process | [docs/workflows.md](./docs/workflows.md#pull-request-process)             |
| Troubleshooting      | [docs/workflows.md](./docs/workflows.md#troubleshooting)                  |

## Architecture

This is a monorepo with three runtime boundaries:

- **apps/api** - HTTP API server (Fastify)
- **apps/worker** - Background job processor (no HTTP)
- **apps/web** - Frontend application (Next.js)

**Key rule:** Apps cannot import from each other. Shared code lives in `packages/`.

See [`AGENTS.md`](./AGENTS.md) for detailed architecture rules and guidelines.
