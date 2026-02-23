/**
 * Domain entities for the webhook monitoring system.
 *
 * Core entities:
 * - Project: Tenant boundary (root aggregate)
 * - WebhookEndpoint: Unique URL for receiving webhooks (owned by Project)
 * - Event: Immutable webhook request record (owned by WebhookEndpoint and Project)
 * - DeliveryAttempt: Append-only audit log of each HTTP delivery attempt
 */

import type {
  Prisma,
  Project,
  WebhookEndpoint,
  Event,
  DeliveryAttempt,
} from "./generated/client.js";
import { EventStatus } from "./generated/enums.js";

export {
  type Project,
  type WebhookEndpoint,
  type Event,
  type DeliveryAttempt,
  EventStatus,
};

// Relationship types for queries with includes
export type ProjectWithRelations = Project & {
  endpoints: WebhookEndpoint[];
  events: Event[];
};

export type WebhookEndpointWithRelations = WebhookEndpoint & {
  project: Project;
  events: Event[];
};

export type EventWithRelations = Event & {
  endpoint: WebhookEndpoint;
  project: Project;
  deliveryAttempts: DeliveryAttempt[];
};

export type DeliveryAttemptWithRelations = DeliveryAttempt & {
  event: Event;
};

/**
 * Valid state machine transitions for EventStatus.
 *
 * Terminal states (DELIVERED, FAILED) have no outgoing transitions.
 *
 * Valid paths:
 *   PENDING  → RETRYING
 *   PENDING  → DELIVERED
 *   PENDING  → FAILED
 *   RETRYING → RETRYING
 *   RETRYING → DELIVERED
 *   RETRYING → FAILED
 */
const VALID_TRANSITIONS: Readonly<
  Partial<Record<EventStatus, ReadonlySet<EventStatus>>>
> = {
  [EventStatus.PENDING]: new Set([
    EventStatus.RETRYING,
    EventStatus.DELIVERED,
    EventStatus.FAILED,
  ]),
  [EventStatus.RETRYING]: new Set([
    EventStatus.RETRYING,
    EventStatus.DELIVERED,
    EventStatus.FAILED,
  ]),
  // DELIVERED and FAILED are terminal — no entries here
};

/**
 * Returns true if transitioning an event from `from` to `to` is permitted
 * by the delivery state machine. Terminal states (DELIVERED, FAILED) never
 * allow further transitions.
 */
export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return VALID_TRANSITIONS[from]?.has(to) ?? false;
}

/**
 * Validates the critical invariant: event.projectId === endpoint.projectId
 * Must be enforced when creating events to maintain referential integrity.
 */
export function validateEventProjectScope(
  event: Pick<Event, "projectId">,
  endpoint: Pick<WebhookEndpoint, "projectId">
): boolean {
  return event.projectId === endpoint.projectId;
}

/**
 * Type guard to check if an error is a Prisma unique constraint violation
 * Uses duck typing instead of instanceof to avoid cross-realm issues
 */
export function isUniqueConstraintError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002" &&
    "meta" in error
  );
}

/**
 * Type guard to check if an error is specifically an idempotency key conflict
 * P2002 unique constraint violation on [projectId, idempotencyKey]
 */
export function isIdempotencyConflict(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  if (!isUniqueConstraintError(error)) {
    return false;
  }

  // Check if the conflict is on the idempotencyKey field
  const meta = (error as { meta?: { target?: unknown; modelName?: string } })
    .meta;
  const target = meta?.target;

  // Prisma 7 with driver adapter: check target array
  if (Array.isArray(target)) {
    return target.includes("idempotencyKey") && target.includes("projectId");
  }

  // Prisma 7 with driver adapter fallback: check modelName and error message
  const errorMessage = (error as { message?: string }).message || "";
  return (
    meta?.modelName === "Event" &&
    errorMessage.includes("idempotencyKey") &&
    errorMessage.includes("projectId")
  );
}
