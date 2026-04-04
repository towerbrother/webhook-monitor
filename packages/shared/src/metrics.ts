import { Registry, Counter, Histogram } from "prom-client";

export const registry = new Registry();

export const eventsReceivedTotal = new Counter({
  name: "webhook_events_received_total",
  help: "Total number of webhook events received",
  labelNames: ["project_id"] as const,
  registers: [registry],
});

export const deliveryAttemptsTotal = new Counter({
  name: "webhook_delivery_attempts_total",
  help: "Total number of webhook delivery attempts",
  labelNames: ["project_id", "success"] as const,
  registers: [registry],
});

export const deliveryDurationMs = new Histogram({
  name: "webhook_delivery_duration_ms",
  help: "Webhook delivery duration in milliseconds",
  labelNames: ["project_id", "success"] as const,
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
  registers: [registry],
});
