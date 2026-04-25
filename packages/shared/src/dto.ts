import type { WebhookEndpoint } from "@repo/db";

/**
 * Public WebhookEndpoint DTO — excludes @sensitive fields.
 * Use this type in all API responses. Never return WebhookEndpoint directly.
 */
export type WebhookEndpointDTO = Omit<WebhookEndpoint, "signingSecret">;

/**
 * Strips signingSecret from a WebhookEndpoint object at runtime.
 * Use when you have a full model and need to produce a safe response.
 * Prefer Prisma select clauses where possible (zero-allocation).
 */
export function toWebhookEndpointDTO(
  endpoint: WebhookEndpoint
): WebhookEndpointDTO {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signingSecret, ...dto } = endpoint;
  return dto;
}
