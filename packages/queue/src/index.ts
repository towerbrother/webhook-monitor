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

// Re-export BullMQ types for convenience when needed later
export { Queue, Worker, Job, QueueEvents } from "bullmq";
export type { QueueOptions, JobsOptions } from "bullmq";
