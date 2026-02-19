/**
 * Domain entities for the webhook monitoring system.
 *
 * Three core entities:
 * - Project: Tenant boundary (root aggregate)
 * - WebhookEndpoint: Unique URL for receiving webhooks (owned by Project)
 * - Event: Immutable webhook request record (owned by WebhookEndpoint and Project)
 */

import type { Project, WebhookEndpoint, Event } from "./generated/client.js";

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
