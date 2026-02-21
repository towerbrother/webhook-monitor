# Queue Package Guidelines

BullMQ job queue for webhook-monitor.

See [root AGENTS.md](../../AGENTS.md) for shared guidelines.

## Responsibilities

- **Job definitions** – Define job types and payloads
- **Queue configuration** – Configure BullMQ queues and connections
- **Job enqueueing utilities** – Provide functions to add jobs to queues

## BullMQ Patterns

### Defining Jobs

- Define job types with TypeScript interfaces
- Export job names as constants
- Provide type-safe enqueue functions

### Queue Configuration

- Use Redis for BullMQ backend
- Configure retry strategies for failed jobs
- Set appropriate job timeouts

### Job Lifecycle

1. **API enqueues** – `apps/api` adds jobs to queue
2. **Worker processes** – `apps/worker` consumes and executes jobs
3. **Retry on failure** – Failed jobs are retried according to strategy

## Constraints

- **No job processing logic here** – Processing happens in `apps/worker`
- **No direct Redis access** – Use BullMQ abstractions

See [recipes.md](../../docs/recipes.md#adding-a-background-job) for job patterns.
