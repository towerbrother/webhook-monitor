# Webhook Monitor — Implementation Plan

**Date:** 2026-02-23  
**Assessment base:** Current repository state as of 2026-02-23

---

## Phase 1 — Current State Assessment

### Capability Inventory

| Capability                                      | Status                   | Evidence                                                                                          |
| ----------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| Core domain entities                            | ✅ Fully implemented     | `Project`, `WebhookEndpoint`, `Event` with FK constraints, cascade deletes, tenant-scoped indexes |
| Migrations                                      | ✅ Fully implemented     | 3 migrations: init → add project key → add idempotency key column + unique constraint             |
| Ingestion API (route + auth + tenant isolation) | ✅ Fully implemented     | `POST /webhooks/:endpointId`, `authenticateProject` middleware, cross-tenant 404 enforced         |
| Request body/params schema validation           | ❌ Not implemented       | Route body is typed as `unknown`; no Zod schema applied (required by `apps/api/AGENTS.md`)        |
| Idempotency key extraction from request         | ❌ Not implemented       | `Event.idempotencyKey` column exists but route never reads a key from the request                 |
| Idempotency enforcement (DB constraint)         | ✅ Fully implemented     | `UNIQUE(projectId, idempotencyKey)` present; NULLs not deduplicated                               |
| Idempotency enforcement (queue dedup)           | ✅ Fully implemented     | `jobId = eventId` prevents duplicate BullMQ jobs                                                  |
| Queue integration + retry config                | ✅ Fully implemented     | `webhook-delivery` queue, 5 attempts, exponential backoff from 1 s, job ID dedup                  |
| Worker process scaffolding                      | ✅ Fully implemented     | Concurrency 10, graceful shutdown on `SIGTERM`/`SIGINT`, job event logging                        |
| HTTP delivery logic                             | ✅ Fully implemented     | `processWebhookDelivery` uses native `fetch` with `AbortSignal.timeout(30_000)`                   |
| Delivery attempt persistence / state machine    | ✅ Fully implemented     | `DeliveryAttempt` created + `Event.status` updated in single Prisma transaction                   |
| Retry enforcement at processor level            | ✅ Fully implemented     | `DeliveryError` thrown on non-2xx; BullMQ exponential backoff triggers retries                    |
| Replay capability                               | ❌ Not implemented       | No re-enqueue endpoint or mechanism                                                               |
| Structured logging — API                        | ✅ Fully implemented     | Pino via Fastify with `pino-pretty` in dev                                                        |
| Structured logging — Worker                     | ⚠️ Partially implemented | Ad-hoc `console.log` + JSON; Pino planned but absent                                              |
| Correlation IDs / request tracing               | ❌ Not implemented       | No `requestId` propagation from ingestion through queue into delivery                             |
| Metrics                                         | ❌ Not implemented       | No Prometheus, OpenTelemetry, or equivalent                                                       |
| Rate limiting                                   | ❌ Not implemented       | No middleware present                                                                             |
| Signature / HMAC verification                   | ❌ Not implemented       | No `x-hub-signature` or equivalent check                                                          |
| CI pipeline                                     | ✅ Fully implemented     | GitHub Actions: lint, type-check, test (live PG + Redis), build on PR and `main` push             |
| Branch protection / CODEOWNERS                  | ✅ Fully implemented     | `.github/CODEOWNERS` present                                                                      |
| Dockerfiles                                     | ❌ Not implemented       | None present                                                                                      |
| Staging deployment                              | ❌ Not implemented       | No deployment config of any kind                                                                  |
| Production deployment                           | ❌ Not implemented       | No deployment config of any kind                                                                  |

### Architectural Integrity Check

| Concern                              | Verdict | Notes                                                                                            |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| Multi-tenancy enforcement            | ✅      | All DB queries scoped by `projectId`; cross-tenant endpoint returns 404 (no info leakage)        |
| Idempotency at DB level              | ✅      | Unique constraint in place; constraint is dead on arrival until route populates `idempotencyKey` |
| App isolation (no cross-app imports) | ✅      | Apps import only from `packages/`                                                                |
| Stateless service design             | ✅      | No in-memory state; all state in PostgreSQL or Redis                                             |
| Horizontal scalability feasibility   | ✅      | Stateless API, stateless worker; BullMQ supports multiple competing consumers                    |
| Proper async decoupling              | ✅      | Ingestion never waits for delivery; enqueue failure is soft                                      |
| Observability maturity               | ❌      | Only basic Pino request logs; no correlation IDs, no metrics, no tracing                         |

### Structural Weaknesses

1. **Idempotency mechanism is architecturally wired but operationally disabled** — the DB constraint and queue dedup exist, but the route never reads or writes `idempotencyKey`, making the entire subsystem inert.
2. ~~**Processor never throws**~~ — ✅ **Resolved in Step 3:** `DeliveryError` is thrown on any non-2xx response, enabling BullMQ retries.
3. **Worker logger is not Pino** — inconsistent log format between API and worker; no structured fields, no log levels, no correlation ID support.
4. **No request validation** — routes accept any shape of body/params. Required by `apps/api/AGENTS.md` but not implemented.
5. ~~**No `Event.status` field**~~ — ✅ **Resolved in Step 2 & 3:** `EventStatus` enum, `status` field, and `DeliveryAttempt` model are implemented; processor updates state transactionally.

### Current Stage

> **The system is currently at Stage 5 — HTTP Delivery complete.**  
> Infrastructure, domain, ingestion, and delivery engine are all operational. The processor makes real HTTP calls, records `DeliveryAttempt` records, and drives the `Event` state machine. Remaining work: Pino logger in worker, correlation IDs, replay endpoint, rate limiting, HMAC verification, metrics, Dockerfiles, and load validation.

---

## Phase 2 — Forward Execution Plan

---

## STEP 1 — Complete Ingestion: Idempotency Key Extraction + Request Validation

### 1. Objective

The idempotency constraint at the DB layer (and queue dedup via `jobId`) are fully wired but operationally dead. The route never reads a client-supplied key. Additionally, route handlers accept unvalidated `unknown` bodies, violating `apps/api/AGENTS.md` policy. Both gaps must be closed before delivery can assert consistent deduplication behavior.

### 2. Scope (What to Build or Refactor)

In `apps/api/src/routes/webhooks.ts`:

- Read `X-Idempotency-Key` header from the request on `POST /webhooks/:endpointId`
- Pass it to the `Event` create call as `idempotencyKey`
- Catch Prisma unique constraint violations (`P2002` on `[projectId, idempotencyKey]`) and return `409 Conflict` with the original `eventId` (idempotent response)
- Add Zod schemas for `:endpointId` path param validation (non-empty string) and optional body shape

### 3. Architectural Constraints

- **Multi-tenancy:** idempotency key uniqueness is scoped per project — do not change the unique index
- **Scalability:** the 409 short-circuit must be fast (index lookup, no queue enqueue)
- **Security:** idempotency key is client-supplied; treat as opaque string, max length 255 chars

### 4. Implementation Checklist

- [ ] Import Zod into `routes/webhooks.ts`
- [ ] Define `EndpointParamsSchema` validating `endpointId` as non-empty string
- [ ] Read `req.headers['x-idempotency-key']` (optional `string | string[]`, take first value, truncate to 255)
- [ ] Pass `idempotencyKey` to `event.create` (omit field if header absent — preserves NULL behavior)
- [ ] Wrap `event.create` in try/catch; detect `PrismaClientKnownRequestError` with code `P2002` and fields including `idempotencyKey`
- [ ] On P2002: query the existing event by `(projectId, idempotencyKey)` and return `409` with `{ success: true, eventId: existing.id, receivedAt: existing.receivedAt, duplicate: true }`
- [ ] Export a helper `isIdempotencyConflict(err): boolean` from `@repo/db` alongside `isUniqueConstraintError`
- [ ] Add/update tests in `apps/api/src/__tests__/webhooks.test.ts`: duplicate key same project → 409 with original `eventId`; duplicate key different project → 201 new event; no key → always 201

### 5. Invariants to Enforce

- A `POST` with the same `X-Idempotency-Key` from the same project must always return the same `eventId` regardless of call count
- NULL idempotency keys must never be deduplicated (existing DB behavior — do not change)
- The 409 response body must be structurally identical to a 201 success (plus `duplicate: true`) so clients can treat both as success

### 6. Failure Modes to Consider

| Failure                                                         | Mitigation                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Race condition: two concurrent requests with same key           | DB unique constraint is the final arbiter; one 201 + one P2002 → 409 — correct |
| Header value is an array (multiple `X-Idempotency-Key` headers) | Take first value, validate type                                                |
| Oversized key (>255 chars)                                      | Return 400 from Zod schema validation                                          |

### 7. Gateway Tests (Must Pass Before Proceeding)

- `POST` with `X-Idempotency-Key: abc` → 201, event created with `idempotencyKey = "abc"`
- Same request again → 409, returns same `eventId`
- Same key, different project → 201, new event
- No header → 201, `event.idempotencyKey` is null
- Invalid `endpointId` (empty string) → 400
- Oversized key (>255 chars) → 400

### 8. Definition of Done

- All new and existing webhook integration tests pass
- Duplicate key produces 409 with matching `eventId`
- No regression in 201 path

---

## STEP 2 — Event Status Model (State Machine Foundation)

### 1. Objective

There is currently no way to know whether an event has been delivered, permanently failed, or is pending. This is a prerequisite for the delivery engine (processor must update state), replay logic, and any dashboard. Adding an `EventDeliveryStatus` enum and a `DeliveryAttempt` model provides the state machine foundation.

### 2. Scope (What to Build or Refactor)

In `packages/db/prisma/schema.prisma`:

- Add `EventStatus` enum: `PENDING`, `DELIVERED`, `FAILED`, `RETRYING`
- Add `status EventStatus @default(PENDING)` to `Event`
- Add `DeliveryAttempt` model: `id`, `eventId`, `projectId`, `attemptNumber`, `requestedAt`, `respondedAt?`, `statusCode?`, `success`, `errorMessage?`
- Add migration

In `packages/db/src/domain.ts`:

- Add `EventStatus` re-export and `canTransition(from, to): boolean`
- Valid transitions: `PENDING → RETRYING`, `PENDING → DELIVERED`, `PENDING → FAILED`, `RETRYING → DELIVERED`, `RETRYING → FAILED`, `RETRYING → RETRYING`
- Terminal states: `DELIVERED`, `FAILED` — no further transitions

### 3. Architectural Constraints

- **Append-only:** `DeliveryAttempt` is never updated, only inserted
- **Denormalization:** `projectId` on `DeliveryAttempt` for future tenant-scoped queries without joins
- **Source of truth:** `Event.status` is the authoritative current state; `DeliveryAttempt` is the audit log
- **Non-destructive migration:** adds columns/tables only, no drops

### 4. Implementation Checklist

- [ ] Add `EventStatus` enum to schema
- [ ] Add `status` field to `Event` model with `@default(PENDING)`
- [ ] Create `DeliveryAttempt` model with all fields; FK to `Event` with `onDelete: Cascade`; index on `(eventId)`, `(projectId, eventId)`
- [ ] Run `pnpm --filter @repo/db migrate dev --name add_delivery_status`
- [ ] Add `canTransition` to `packages/db/src/domain.ts`
- [ ] Add unit tests for `canTransition` covering all valid and invalid transitions
- [ ] Verify `WebhookDeliveryJobData.attempt` in `packages/queue/src/index.ts` aligns with `DeliveryAttempt.attemptNumber`

### 5. Invariants to Enforce

- `Event.status` must only move forward in the state machine — never backward (e.g., `DELIVERED → RETRYING` is forbidden)
- `DeliveryAttempt` records are never updated or deleted (only inserted)
- Every state update to `Event.status` must be accompanied by a `DeliveryAttempt` insert in the same DB transaction

### 6. Failure Modes to Consider

| Failure                  | Mitigation                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Migration on live system | `status` column has a default, existing rows get `PENDING` — safe                                 |
| Worker crashes mid-write | Enforce transactional writes: `Event.status` update + `DeliveryAttempt` insert in one transaction |

### 7. Gateway Tests (Must Pass Before Proceeding)

- `Event` created via ingest route defaults to `status: PENDING`
- `canTransition` permits all valid paths
- `canTransition` rejects terminal-state transitions (`DELIVERED → *`, `FAILED → *`)
- `DeliveryAttempt` cascade-deletes with parent `Event`

### 8. Definition of Done

- Migration applied; schema tests updated and passing
- `EventStatus` transitions covered by unit tests
- No existing tests broken

---

## STEP 3 — HTTP Delivery Engine (Processor Implementation)

### 1. Objective

The processor is a placeholder. This step implements actual HTTP delivery: making the outbound HTTP request to the endpoint URL, recording the result as a `DeliveryAttempt`, and updating `Event.status`. This is the core value-generating capability of the system.

### 2. Scope (What to Build or Refactor)

Replace the placeholder in `apps/worker/src/processor.ts`:

- Make HTTP `POST` (or method from job data) to `job.data.url`
- Forward `headers` and `body` from job data
- Record `DeliveryAttempt` with status code, latency, and success flag
- Update `Event.status`: `DELIVERED` if 2xx, `FAILED` if terminal (max attempts reached + non-2xx), `RETRYING` otherwise
- Throw an `Error` on non-2xx so BullMQ triggers retry

### 3. Architectural Constraints

- **Worker must never expose HTTP** (except internal metrics port — see Step 8)
- **Transactional writes:** DB writes (attempt + status update) must be in a single transaction
- **BullMQ retry contract:** throw errors for BullMQ to handle — do not catch delivery failures silently
- **HTTP client:** use Node 24 native `fetch` with `AbortSignal.timeout` — no extra HTTP client dependency
- **Timeouts:** 30 s total per delivery attempt
- **Multi-tenancy:** `DeliveryAttempt` always written with `projectId` from job data

### 4. Implementation Checklist

- [x] Add `@repo/db` dependency to `apps/worker/package.json`
- [x] Add `DATABASE_URL` env var to `apps/worker/src/env.ts`
- [x] In `apps/worker/src/index.ts`: instantiate `createPrismaClient` and pass `prisma` via job context; include in graceful shutdown sequence
- [x] Update `processWebhookDelivery` signature to accept `{ logger, prisma }` context
- [x] Implement HTTP delivery: `fetch(url, { method, headers, body, signal: AbortSignal.timeout(30_000) })`
- [x] Record `DeliveryAttempt`: `eventId`, `projectId`, `attemptNumber: job.attemptsMade + 1`, `requestedAt`, `respondedAt`, `statusCode`, `success: res.ok`, duration
- [x] Update `Event.status` in same transaction: `DELIVERED` (2xx and not already at max attempts), `FAILED` (BullMQ `isFailed` / last attempt), `RETRYING` (non-2xx, not last)
- [x] Throw `DeliveryError extends Error` on non-2xx response so BullMQ retries
- [x] Update `apps/worker/src/__tests__/processor.test.ts` with mocked `fetch` and `prisma`
- [ ] Add worker integration test: enqueue real job → verify `DeliveryAttempt` created and `Event.status = DELIVERED`

### 5. Invariants to Enforce

- Every job execution produces exactly one `DeliveryAttempt`
- `Event.status` is updated atomically with `DeliveryAttempt` in a single transaction
- Non-2xx responses always throw so BullMQ manages retry timeline
- Timeout aborts the fetch and throws, triggering retry

### 6. Failure Modes to Consider

| Failure                                        | Mitigation                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Network timeout                                | `AbortSignal.timeout` throws `TimeoutError` → caught, recorded as failed attempt, re-thrown for BullMQ    |
| DNS failure / connection refused               | Native `fetch` throws → same handling                                                                     |
| Prisma write failure after successful delivery | Delivery happened but status not recorded — on re-attempt, check if already `DELIVERED` and short-circuit |
| Concurrent worker instances on same job        | BullMQ locks prevent this — document as invariant                                                         |

### 7. Gateway Tests (Must Pass Before Proceeding)

- Delivery to mock server returning 200 → `Event.status = DELIVERED`, attempt with `success: true`
- Delivery to mock server returning 500 → throws, `Event.status = RETRYING`, attempt with `success: false`
- Delivery to mock server returning 500 on all 5 attempts → `Event.status = FAILED`, 5 `DeliveryAttempt` records
- Fetch timeout → re-throws, BullMQ retries
- Correct headers forwarded to destination

### 8. Definition of Done

- Processor makes real HTTP calls
- All delivery outcomes produce `DeliveryAttempt` records
- `Event.status` correctly reflects delivery outcome
- All processor tests pass

---

## STEP 4 — Pino Logger in Worker + Correlation ID Propagation

### 1. Objective

Worker currently uses an ad-hoc `console.log`-based logger with no log levels, no structured fields, and no correlation with API request IDs. This makes production debugging difficult and breaks log aggregation parity with the API. Correlation IDs must flow from ingestion through the queue payload into delivery logs.

### 2. Scope (What to Build or Refactor)

- Replace the custom logger in `apps/worker/src/index.ts` with a Pino instance
- Add `correlationId` to `WebhookDeliveryJobData` in `packages/queue/src/index.ts`
- In `apps/api/src/routes/webhooks.ts`: pass Fastify's `request.id` as `correlationId` when enqueuing
- In processor: log all delivery events with `{ correlationId, eventId, projectId, endpointId, attempt }`

### 3. Architectural Constraints

- Pino must be configured identically in API and worker (same `LOG_LEVEL` env var, same field names)
- `correlationId` is set at ingestion time and is immutable throughout the job lifecycle
- No PII in logs (headers that may contain auth tokens should be filtered)

### 4. Implementation Checklist

- [ ] Add `pino` dep to `apps/worker/package.json`
- [ ] Add `LOG_LEVEL` env var (default `info`) to both `apps/api/src/env.ts` and `apps/worker/src/env.ts`
- [ ] Create `apps/worker/src/logger.ts`: exports `createLogger(options)` factory using Pino; `pino-pretty` transport for non-production
- [ ] Replace all logging in `index.ts` and `processor.ts` with Pino child logger calls including `{ service: "worker" }`
- [ ] Add `correlationId: string` to `WebhookDeliveryJobData`
- [ ] Update `enqueueWebhookDelivery` caller in `webhooks.ts` to pass `request.id` as `correlationId`
- [ ] Update all processor log calls to include `correlationId`
- [ ] Verify processor tests pass with updated logger interface

### 5. Invariants to Enforce

- Every log line in the worker must include at minimum: `correlationId`, `eventId`, `projectId`
- Log level is controlled exclusively by `LOG_LEVEL` env var — never hardcoded

### 6. Failure Modes to Consider

| Failure                                     | Mitigation                                                        |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `correlationId` absent on old jobs in queue | Processor defaults to `job.id` if `correlationId` is undefined    |
| Log volume at high throughput               | Pino is async-friendly; avoid synchronous log sinks in production |

### 7. Gateway Tests (Must Pass Before Proceeding)

- Worker startup log emitted at `info` level as valid JSON (in non-pretty mode)
- Processor completion log includes `correlationId` matching the value set at ingestion
- `LOG_LEVEL=warn` suppresses `info` logs

### 8. Definition of Done

- Worker uses Pino throughout
- `correlationId` flows from API request → queue job → worker log
- No `console.log` calls remain in worker source

---

## STEP 5 — Replay Capability

### 1. Objective

Without replay, any delivery failure requires manual intervention. A replay endpoint lets operators re-trigger delivery for a specific event by re-enqueuing it, respecting idempotency at the queue level.

### 2. Scope (What to Build or Refactor)

Add to `apps/api/src/routes/webhooks.ts`:

- `GET /webhooks/:endpointId/events` — paginated event list with `status`, `idempotencyKey`, `receivedAt`
- `POST /webhooks/:endpointId/events/:eventId/replay` — re-enqueue a failed event

### 3. Architectural Constraints

- **Multi-tenancy:** `(eventId, projectId)` lookup enforces isolation
- **Stateless:** replay uses existing DB data — no re-ingestion of the original HTTP request
- **Idempotency:** calling replay twice for `FAILED` event is safe (second call finds job already waiting → `queued: false`)
- Do not replay `PENDING` or `RETRYING` events

### 4. Implementation Checklist

- [ ] Add `GET /webhooks/:endpointId/events` handler with pagination (`cursor` or `page`+`limit`)
- [ ] Add `POST /webhooks/:endpointId/events/:eventId/replay` handler
- [ ] Validate `endpointId` and `eventId` params with Zod
- [ ] Lookup `Event` by `(id, projectId)` and verify `endpointId` matches
- [ ] Guard: `status === DELIVERED` → return `200 { queued: false, message: "Already delivered" }`
- [ ] Guard: `status === PENDING || RETRYING` → return `200 { queued: false, message: "Already in progress" }`
- [ ] On `FAILED`: update `Event.status = PENDING`, enqueue job, return `202 { queued: true, eventId }`
- [ ] Add integration tests: replay FAILED → 202; replay DELIVERED → 200 no-op; unknown eventId → 404; cross-tenant → 404

### 5. Invariants to Enforce

- Replay never creates a new `Event` — it re-uses the existing one
- Status reset from `FAILED → PENDING` must happen transactionally with enqueue acknowledgement
- Cross-tenant replay must return 404, not 403

### 6. Failure Modes to Consider

| Failure                                      | Mitigation                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| Enqueue succeeds but status update fails     | Use transaction scope; on re-attempt, processor checks existing status |
| Endpoint URL changed since original delivery | Replay uses latest URL — document this as expected behavior            |

### 7. Gateway Tests (Must Pass Before Proceeding)

- `POST .../replay` on `FAILED` event → 202, `Event.status = PENDING`, job present in Redis
- `POST .../replay` on `DELIVERED` event → 200, `{ queued: false }`
- `POST .../replay` on nonexistent event → 404
- Cross-project event via correct endpoint → 404

### 8. Definition of Done

- Replay endpoint functional for `FAILED` events
- All guard cases tested and documented
- No new events created by replay

---

## STEP 6 — Rate Limiting

### 1. Objective

The ingestion API has no protection against burst traffic or per-tenant abuse. Any tenant can flood the ingest endpoint and exhaust DB connections. `@fastify/rate-limit` provides per-key rate limiting backed by Redis, consistent across horizontal API replicas.

### 2. Scope (What to Build or Refactor)

- Register `@fastify/rate-limit` in `apps/api/src/app.ts`
- Rate limit keyed by `project.id` (from `request.project` — applied after auth middleware)
- Default limit: 100 requests / 60 s per project (env-configurable)
- 429 response: `{ error: "Too Many Requests", retryAfter: N }`

### 3. Architectural Constraints

- **Scalability:** Redis store for cross-replica consistency
- **Key:** always `projectId` for authenticated requests — never raw IP
- **Exclusion:** `/health` and `/metrics` routes must not be rate-limited

### 4. Implementation Checklist

- [ ] Add `@fastify/rate-limit` to `apps/api/package.json`
- [ ] Add `RATE_LIMIT_MAX` (default 100) and `RATE_LIMIT_WINDOW_MS` (default 60000) to `apps/api/src/env.ts`
- [ ] Register plugin in `buildApp` with `keyGenerator: (req) => req.project?.id ?? req.ip`; Redis store
- [ ] Add test: 101st request from same project within window → 429; fresh window → 200; different project → 200

### 5. Invariants to Enforce

- Rate limit key is always `projectId` for authenticated requests
- Redis store failure must fail open (allow request) with a warning log
- `/health` is excluded from rate limiting

### 6. Failure Modes to Consider

| Failure                              | Mitigation                                                                |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Redis unavailable                    | Configure `@fastify/rate-limit` to fail open — log warning, allow request |
| Slight over-counting across replicas | Acceptable eventual consistency — document as known characteristic        |

### 7. Gateway Tests (Must Pass Before Proceeding)

- 101st request from same project within window → 429 with `Retry-After` header
- 101st request from a different project → 200
- `/health` → 200, not rate-limited

### 8. Definition of Done

- Rate limiting active on all `/webhooks` routes
- Per-tenant enforcement verified by tests
- Redis-backed store configured

---

## STEP 7 — Signature Verification (HMAC)

### 1. Objective

Currently any HTTP caller can deliver to any endpoint if they know the project key. Webhook senders typically sign their payloads with a shared secret. Adding optional HMAC-SHA256 verification per endpoint prevents processing of spoofed or tampered payloads.

### 2. Scope (What to Build or Refactor)

- Add optional `signingSecret String?` to `WebhookEndpoint` schema + migration
- Add `verifyWebhookSignature(payload: Buffer, signature: string, secret: string): boolean` using `crypto.timingSafeEqual` to `packages/shared`
- In ingest route: if `endpoint.signingSecret` is set, read `X-Hub-Signature-256`, verify HMAC-SHA256 — return `401 Invalid signature` on mismatch

### 3. Architectural Constraints

- **Security:** signature verification must use `crypto.timingSafeEqual`
- **Privacy:** `signingSecret` must never appear in API response bodies or logs
- **Backward compatibility:** endpoints without a secret accept all traffic
- **Raw body:** the raw request body must be available for HMAC computation — configure Fastify's raw body preservation

### 4. Implementation Checklist

- [ ] Add `signingSecret String?` to `WebhookEndpoint` schema
- [ ] Run migration: `pnpm --filter @repo/db migrate dev --name add_signing_secret`
- [ ] Add `verifyWebhookSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean` to `@repo/shared`
- [ ] Configure Fastify to preserve raw body (`addContentTypeParser` or `rawBody` plugin)
- [ ] In `POST /webhooks/:endpointId`: if `endpoint.signingSecret` exists, read `x-hub-signature-256`, call `verifyWebhookSignature`, return `401` on failure
- [ ] Unit test `verifyWebhookSignature`: valid → true; tampered body → false; wrong secret → false
- [ ] Integration tests: signed request correct secret → 201; wrong secret → 401; no secret on endpoint → 201 regardless

### 5. Invariants to Enforce

- `signingSecret` is write-only from API perspective — never returned to clients
- Signature check happens before event creation and queue enqueue
- Empty-string `signingSecret` must not activate verification (only non-null, non-empty)

### 6. Failure Modes to Consider

| Failure                                     | Mitigation                                           |
| ------------------------------------------- | ---------------------------------------------------- |
| Missing signature header when secret is set | Return 401 with message "Signature required"         |
| Raw body unavailable                        | Test Fastify content-type parser boundary explicitly |

### 7. Gateway Tests (Must Pass Before Proceeding)

- Valid HMAC-SHA256 signature → 201
- Tampered body → 401
- Wrong secret → 401
- No signature header, endpoint has secret → 401
- No signature header, endpoint has no secret → 201

### 8. Definition of Done

- Signature verification active for all endpoints with `signingSecret`
- Timing-safe comparison enforced
- `signingSecret` never logged or returned

---

## STEP 8 — Metrics Instrumentation

### 1. Objective

The system has no metrics. There is no way to observe delivery success rates, queue depth, retry rates, or per-tenant throughput. This is a blocker for production readiness.

### 2. Scope (What to Build or Refactor)

Add Prometheus-compatible metrics using `prom-client`:

| Metric                            | Type      | Labels                                            |
| --------------------------------- | --------- | ------------------------------------------------- |
| `webhook_events_received_total`   | Counter   | `project_id`, `status`                            |
| `webhook_delivery_attempts_total` | Counter   | `project_id`, `outcome` (success/failure/timeout) |
| `webhook_delivery_duration_ms`    | Histogram | `project_id`, `outcome`                           |
| `webhook_queue_depth`             | Gauge     | — (scraped from BullMQ queue count)               |
| `webhook_events_status_total`     | Gauge     | `status` (PENDING/DELIVERED/FAILED/RETRYING)      |

### 3. Architectural Constraints

- `/metrics` endpoint must not be auth-protected and excluded from tenant rate limiting
- Metrics must not add measurable latency to the ingest path
- Single `prom-client` global registry per process
- Worker exposes metrics on a separate internal port (e.g., 9091) — **the only HTTP surface the worker exposes**

### 4. Implementation Checklist

- [ ] Add `prom-client` to `apps/api/package.json` and `apps/worker/package.json`
- [ ] Create `packages/shared/src/metrics.ts` with metric definitions using a shared registry
- [ ] Register `GET /metrics` in `buildApp` before other routes; excluded from auth + rate limiting
- [ ] Increment `webhook_events_received_total` in ingest route on 201
- [ ] Record `webhook_delivery_duration_ms` and `webhook_delivery_attempts_total` in processor
- [ ] Worker: add minimal HTTP server on port `METRICS_PORT` (env-configurable, default 9091) serving `GET /metrics`
- [ ] Add test: `GET /metrics` returns 200 with `Content-Type: text/plain; version=0.0.4`

### 5. Invariants to Enforce

- Metrics are recorded even on error paths
- Label cardinality must be bounded — never use raw URL or header values as labels
- `/metrics` is internal infrastructure — never exposed publicly

### 6. Failure Modes to Consider

| Failure                 | Mitigation                                                             |
| ----------------------- | ---------------------------------------------------------------------- |
| Metrics registry error  | Wrap in try/catch — must not crash the service                         |
| High cardinality labels | Enforce bounded label sets; reject unbounded values at definition time |

### 7. Gateway Tests (Must Pass Before Proceeding)

- After one ingest, `webhook_events_received_total` count = 1
- After one delivery, `webhook_delivery_attempts_total` incremented
- `GET /metrics` returns valid Prometheus text format

### 8. Definition of Done

- All 5 metric families instrumented
- `/metrics` endpoint functional on API
- Worker metrics available on internal port

---

## STEP 9 — Dockerfiles + Deployment Configuration

### 1. Objective

No Dockerfiles or deployment configs exist. The system cannot be deployed to any environment. This step produces production-ready container images for all three apps.

### 2. Scope (What to Build or Refactor)

- `apps/api/Dockerfile` — multi-stage build
- `apps/worker/Dockerfile` — multi-stage build
- `apps/web/Dockerfile` — Next.js standalone output
- Update `docker-compose.yml` to add `api`, `worker`, and `web` services
- Add `.dockerignore` at monorepo root
- Add `.env.example` at repo root documenting all required env vars

### 3. Architectural Constraints

- **Base image:** Node 24 Alpine
- **Multi-stage:** install + build in `builder`, copy only `dist/` and `node_modules` to runtime stage
- **Prisma:** client must be generated in the build stage, not at runtime
- **Security:** no secrets baked into images; all config via environment variables; run as non-root (`USER node`)
- **Health check:** `HEALTHCHECK` instruction in each Dockerfile

### 4. Implementation Checklist

- [ ] `apps/api/Dockerfile`: stage 1 installs deps + generates Prisma + builds; stage 2 copies artifacts only
- [ ] Entrypoint in API Dockerfile: run `prisma migrate deploy` before starting Node
- [ ] `apps/worker/Dockerfile`: same multi-stage pattern; no HTTP complexity
- [ ] `apps/web/Dockerfile`: set `output: "standalone"` in `next.config.ts`; copy `.next/standalone`
- [ ] Add `api`, `worker`, `web` services to `docker-compose.yml` with `depends_on` (postgres + redis healthchecks)
- [ ] Add `.dockerignore`: exclude `.git`, `node_modules`, `.next`, `dist`, test files
- [ ] Add `.env.example` documenting all env vars for all three apps

### 5. Invariants to Enforce

- Images run as non-root
- No `.env` files copied into images
- Prisma client pre-generated in build stage

### 6. Failure Modes to Consider

| Failure                             | Mitigation                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Prisma migration not run at startup | `prisma migrate deploy` in API entrypoint before server start                    |
| Missing env vars at container start | Apps call `process.exit(1)` on Zod parse failure — works correctly in containers |

### 7. Gateway Tests (Must Pass Before Proceeding)

- `docker build` succeeds for all three apps without errors
- `docker-compose up` brings all services to healthy state
- `curl http://localhost:3001/health` → `{ "status": "ok" }`
- API container with missing env var → exits with non-zero code

### 8. Definition of Done

- All three Dockerfiles build without errors
- Full stack runs via `docker-compose up`
- Health check passes in container context

---

## STEP 10 — Load Validation + Failure Recovery

### 1. Objective

Before declaring production readiness, the system must demonstrate it can handle realistic throughput and recover from infrastructure failures.

### 2. Scope (What to Build or Refactor)

- Load test: 1,000 events/minute sustained for 5 minutes against the ingest API
- Chaos tests: Redis disconnect mid-delivery, PostgreSQL disconnect mid-write, worker crash mid-job
- Measure: p50/p95/p99 ingest latency, delivery success rate, queue drain time after chaos recovery

### 3. Architectural Constraints

- Load tests run against the `docker-compose`-based stack from Step 9
- Use `k6` for scenario scripting
- Chaos testing via `docker-compose stop redis/postgres` during load

### 4. Implementation Checklist

- [ ] Add `scripts/load-test.js` (k6 script): ramp to 100 VU, sustain 5 min, assert p95 < 200 ms and error rate < 1%
- [ ] Add `scripts/chaos-redis.sh`: start load, stop Redis, verify graceful degradation, restart, verify recovery
- [ ] Add `scripts/chaos-db.sh`: stop Postgres, verify API returns 503 (not 500), restart, verify recovery
- [ ] Assert delivery queue backlog drains within SLA after outage recovery (all `PENDING` → `DELIVERED`)
- [ ] Document findings and SLA thresholds in `docs/infrastructure.md`

### 5. Invariants to Enforce

- Ingest endpoint returns 503 (not 500) when DB is down
- No data loss: all enqueued events must eventually be delivered after recovery
- Worker must reconnect to Redis automatically on restart

### 6. Failure Modes to Consider

| Failure                   | Mitigation                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| DB down during ingest     | Event cannot be stored → API 503; no enqueue (correct — never enqueue without an event ID)       |
| Redis down during enqueue | Event stored but not queued → document as known gap; plan reconciliation job in future iteration |

### 7. Gateway Tests (Must Pass Before Proceeding)

- p95 ingest latency < 200 ms under load
- Error rate < 1% under sustained load
- All events eventually delivered after Redis/Postgres restart
- Worker gracefully reconnects after Redis restart

### 8. Definition of Done

- Load test script exists and passes defined thresholds
- Chaos recovery documented with actual observed behavior
- No data loss under any tested failure scenario

---

## Master Checklist

### Completed Capabilities

- [x] PostgreSQL + Redis infrastructure (Docker Compose for dev)
- [x] `Project`, `WebhookEndpoint`, `Event` domain models with FK constraints + cascade deletes
- [x] Database migrations (init, project key, idempotency key column)
- [x] `authenticateProject` middleware (`X-Project-Key` header)
- [x] Multi-tenant endpoint scoping in ingest route (cross-tenant → 404)
- [x] `Event` append-only creation with headers + body
- [x] BullMQ queue with 5-attempt exponential backoff config
- [x] `jobId = eventId` queue-level deduplication
- [x] Worker process scaffolding: concurrency 10, graceful shutdown
- [x] DB-level idempotency unique constraint `(projectId, idempotencyKey)`
- [x] `validateEventProjectScope` domain helper
- [x] GitHub Actions CI: lint, type-check, test (live services), build
- [x] CODEOWNERS + Renovate config
- [x] Env validation (Zod) in all three apps
- [x] Integration test suites for DB, queue, API routes

### Refactor Tasks

- [ ] (**Step 1**) Populate `Event.idempotencyKey` from `X-Idempotency-Key` header in `apps/api/src/routes/webhooks.ts`
- [ ] (**Step 1**) Add Zod body/params validation to all webhook routes
- [x] (**Step 3**) Add `DATABASE_URL` env var to `apps/worker/src/env.ts`
- [ ] (**Step 4**) Replace ad-hoc worker logger with Pino instance in `apps/worker/src/index.ts`
- [ ] (**Step 4**) Add `correlationId` to `WebhookDeliveryJobData` and thread it through ingest → queue → processor

### Remaining Capabilities

- [ ] (**Step 1**) Idempotency key extraction + 409 response
- [ ] (**Step 2**) `EventStatus` enum + `status` field on `Event` — migration
- [ ] (**Step 2**) `DeliveryAttempt` model — migration
- [ ] (**Step 2**) `canTransition` state machine helper + unit tests
- [x] (**Step 3**) HTTP delivery in processor (`fetch` to endpoint URL)
- [x] (**Step 3**) `DeliveryAttempt` write + `Event.status` update in processor (transactional)
- [x] (**Step 3**) Processor throws on non-2xx (enables BullMQ retry)
- [ ] (**Step 4**) Pino in worker + `LOG_LEVEL` env var in both API and worker
- [ ] (**Step 4**) Correlation ID propagation end-to-end
- [ ] (**Step 5**) `GET /webhooks/:endpointId/events` list endpoint
- [ ] (**Step 5**) `POST /webhooks/:endpointId/events/:eventId/replay` endpoint
- [ ] (**Step 6**) `@fastify/rate-limit` with Redis store, keyed by `projectId`
- [ ] (**Step 7**) `signingSecret` on `WebhookEndpoint` — migration
- [ ] (**Step 7**) HMAC-SHA256 request signature verification in ingest route
- [ ] (**Step 8**) Prometheus metrics (`prom-client`) on API + worker internal port
- [ ] (**Step 9**) Dockerfiles for `api`, `worker`, `web`
- [ ] (**Step 9**) Full `docker-compose.yml` with all services
- [ ] (**Step 9**) `.env.example` at repo root
- [ ] (**Step 10**) `k6` load test script
- [ ] (**Step 10**) Chaos test scripts
- [ ] (**Step 10**) Recovery SLA documentation in `docs/infrastructure.md`
