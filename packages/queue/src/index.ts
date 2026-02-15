import { Queue, Worker, Job, QueueEvents } from "bullmq";
import type { RedisOptions, QueueOptions, JobsOptions } from "bullmq";

/**
 * Queue names - centralized definition
 */
export const QUEUE_NAMES = {
  WEBHOOK_DELIVERY: "webhook-delivery",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Webhook delivery job data structure
 */
export interface WebhookDeliveryJobData {
  eventId: string;
  projectId: string;
  endpointId: string;
  url: string;
  method: string;
  headers: Record<string, unknown>;
  body: unknown;
  attempt: number;
}

/**
 * Default job options for webhook delivery queue
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 60 * 60, // 24 hours
  },
  removeOnFail: {
    count: 5000,
  },
};

/**
 * Configuration for creating a webhook delivery queue
 */
export interface QueueConfig {
  redis: RedisOptions;
  jobOptions?: JobsOptions;
}

/**
 * Create a webhook delivery queue instance.
 * Caller is responsible for calling queue.close() on shutdown.
 *
 * @example
 * ```typescript
 * const queue = createWebhookDeliveryQueue({
 *   redis: { host: "localhost", port: 6379 }
 * });
 * await queue.add("job-name", data);
 * // on shutdown:
 * await queue.close();
 * ```
 */
export function createWebhookDeliveryQueue(
  config: QueueConfig
): Queue<WebhookDeliveryJobData> {
  return new Queue<WebhookDeliveryJobData>(QUEUE_NAMES.WEBHOOK_DELIVERY, {
    connection: config.redis,
    defaultJobOptions: config.jobOptions ?? DEFAULT_JOB_OPTIONS,
  });
}

/**
 * Enqueue a webhook delivery job.
 * Uses eventId as jobId for idempotency.
 */
export async function enqueueWebhookDelivery(
  queue: Queue<WebhookDeliveryJobData>,
  data: WebhookDeliveryJobData
): Promise<string> {
  const job = await queue.add(`deliver-${data.eventId}`, data, {
    jobId: data.eventId,
  });
  return job.id!;
}

// Re-export BullMQ types for convenience
export { Queue, Worker, Job, QueueEvents };
export type { QueueOptions, JobsOptions, RedisOptions };
