# API App Guidelines

Fastify backend API for webhook-monitor.

See [root AGENTS.md](../../AGENTS.md) for shared guidelines.

## Responsibilities

- **HTTP endpoints only** – Handle incoming requests
- **No background work** – Enqueue jobs to worker instead
- **Validation** – Use Zod for request validation
- **Database access** – Use `@repo/db` with Prisma client

## Fastify Patterns

- **Async route handlers** – All routes are async functions
- **Built-in error handling** – Use Fastify's error handler
- **Schema validation** – Define request/response schemas with Zod
- **Plugins** – Register plugins for cross-cutting concerns

## Error Handling

- **HTTP status codes** – Use appropriate codes (400, 401, 404, 500)
- **Log with context** – Include request ID and relevant data

## Constraints

- **No business logic in routes** – Extract to services/handlers
- **No direct database queries** – Use `@repo/db` and Prisma
- **No background processing** – Enqueue to `@repo/queue`

## Adding Routes

1. Create route handler in `src/routes/`
2. Register route in `src/index.ts`
3. Add validation schemas with Zod
4. Handle errors appropriately

See [recipes.md](../../docs/recipes.md#adding-an-api-endpoint) for details.
