/**
 * Shared constants and types for webhook-monitor
 * This package is used to verify monorepo wiring works correctly
 */

// Application name constant
export const APP_NAME = "webhook-monitor" as const;

// Application version
export const VERSION = "0.0.1" as const;

// Placeholder type for webhook events (will be expanded later)
export interface WebhookEvent {
  id: string;
  source: string;
  payload: unknown;
  receivedAt: Date;
}

// Health check response type
export interface HealthCheckResponse {
  status: "ok" | "error";
  timestamp: string;
  service: string;
}
