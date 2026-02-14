import { Queue } from "bullmq";
import type { RedisOptions } from "ioredis";

/**
 * Redis connection configuration for BullMQ
 * Override via environment variables
 */
export const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  maxRetriesPerRequest: null,
};

/**
 * Queue names - centralized definition
 * Will be expanded as we add more job types
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
 * Singleton queue instance for webhook delivery
 * Lazy-initialized on first access
 */
let webhookDeliveryQueue: Queue<WebhookDeliveryJobData> | null = null;

/**
 * Get the webhook delivery queue instance
 * Creates it if it doesn't exist
 */
export function getWebhookDeliveryQueue(): Queue<WebhookDeliveryJobData> {
  if (!webhookDeliveryQueue) {
    webhookDeliveryQueue = new Queue<WebhookDeliveryJobData>(
      QUEUE_NAMES.WEBHOOK_DELIVERY,
      {
        connection: redisConfig,
        defaultJobOptions: {
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
        },
      }
    );
  }
  return webhookDeliveryQueue;
}

/**
 * Enqueue a webhook delivery job
 * Called after event is persisted to database
 */
export async function enqueueWebhookDelivery(
  data: WebhookDeliveryJobData
): Promise<string> {
  const queue = getWebhookDeliveryQueue();
  const job = await queue.add(`deliver-${data.eventId}`, data, {
    jobId: data.eventId, // Use eventId as jobId for idempotency
  });
  return job.id!;
}

/**
 * Close the queue connection
 * Should be called during graceful shutdown
 */
export async function closeQueue(): Promise<void> {
  if (webhookDeliveryQueue) {
    await webhookDeliveryQueue.close();
    webhookDeliveryQueue = null;
  }
}

// Re-export BullMQ types for convenience when needed later
export { Queue, Worker, Job, QueueEvents } from "bullmq";
export type { QueueOptions, JobsOptions } from "bullmq";
