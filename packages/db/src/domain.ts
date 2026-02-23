/**
 * Domain entities for the webhook monitoring system.
 *
 * Three core entities:
 * - Project: Tenant boundary (root aggregate)
 * - WebhookEndpoint: Unique URL for receiving webhooks (owned by Project)
 * - Event: Immutable webhook request record (owned by WebhookEndpoint and Project)
 */

import type {
  Prisma,
  Project,
  WebhookEndpoint,
  Event,
} from "./generated/client.js";

export type { Project, WebhookEndpoint, Event };

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
};

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
