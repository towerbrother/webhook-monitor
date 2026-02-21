# Worker App Guidelines

Background job processor for webhook-monitor.

See [root AGENTS.md](../../AGENTS.md) for shared guidelines.

## Responsibilities

- **Process background jobs** – Handle jobs from `@repo/queue`
- **No HTTP endpoints** – Worker should not expose HTTP
- **Long-running tasks** – Execute tasks that don't fit in HTTP request/response cycle

## Job Processing

- **BullMQ workers** – Use `@repo/queue` for job definitions
- **Idempotent operations** – Jobs should be safe to retry
- **Error handling** – Jobs should fail gracefully and be retryable

## Constraints

- **No HTTP server** – Use API for external communication
- **No global state** – Workers should be stateless
- **No shared memory between jobs** – Each job execution is isolated

See [recipes.md](../../docs/recipes.md#adding-a-background-job) for job patterns.
