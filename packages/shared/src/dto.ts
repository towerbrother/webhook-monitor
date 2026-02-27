// ============================================================================
// WEBHOOK ENDPOINT
// ============================================================================

import type { WebhookEndpoint, Event, DeliveryAttempt } from "@repo/db";

/**
 * Public WebhookEndpoint DTO
 * EXCLUDES sensitive fields like signingSecret
 */
export type WebhookEndpointDTO = Omit<WebhookEndpoint, "signingSecret">;

/**
 * Internal WebhookEndpoint DTO
 * Includes signingSecret - use with caution, never expose in API responses
 */
export type InternalWebhookEndpointDTO = WebhookEndpoint;

/**
 * Helper to strip sensitive fields from a WebhookEndpoint object.
 */
export function toWebhookEndpointDTO(
  endpoint: WebhookEndpoint
): WebhookEndpointDTO {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signingSecret, ...dto } = endpoint;
  return dto;
}

// ============================================================================
// EVENT
// ============================================================================

export type EventDTO = Event & {
  deliveryAttempts?: DeliveryAttempt[];
};

// ============================================================================
// PAGINATION
// ============================================================================

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    cursor?: string | null;
    hasMore: boolean;
  };
}
