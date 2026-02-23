# Architecture Rules

## Workspace Structure

```
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

## Runtime Boundaries

- **apps/api**, **apps/worker**, **apps/web** are runtime boundaries
- **No cross-app imports** – Apps cannot import from other apps
- **Shared code lives only in packages/** – Extract to packages if needed by multiple apps
- **API must never perform background work** – Enqueue jobs to worker instead
- **Worker must never expose HTTP** – Use API for external communication

## Infrastructure

- **PostgreSQL** – Database (via Prisma ORM in packages/db)
- **Redis** – Cache and job queue (via BullMQ in packages/queue)
- **Docker Compose** – Runs PostgreSQL and Redis locally for development
- **Expected local setup** – Database URL: `postgresql://postgres:postgres@localhost:5432/webhook_monitor`

## Constraints

- **No microservices** – This is a monorepo with runtime boundaries, not separate services
- **No infrastructure-as-code** unless explicitly requested (e.g., Terraform, Pulumi)
- **No new frameworks** – Stick to Fastify (API), Next.js (web), Prisma (DB), BullMQ (queue)

## Node.js Version

- **Node.js >= 24.13.1** required (specified in package.json engines)
- **Use latest LTS** recommended for development
