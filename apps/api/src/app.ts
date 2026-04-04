import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@repo/db";
import type { Queue, WebhookDeliveryJobData } from "@repo/queue";
import { APP_NAME, type HealthCheckResponse } from "@repo/shared";
import type { Redis } from "ioredis";
import { webhookRoutes } from "./routes/webhooks.js";

export interface AppOptions {
  prisma: PrismaClient;
  queue: Queue<WebhookDeliveryJobData>;
  logger?: boolean | object;
  /** ioredis client for rate limiting. When omitted, rate limiting is disabled. */
  redis?: Redis;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  rateLimitFailOpen?: boolean;
}

/**
 * Creates and configures a Fastify application instance.
 * Extracted for testability - allows creating app without starting server.
 */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const {
    prisma,
    queue,
    redis,
    rateLimitMax = 100,
    rateLimitWindowMs = 60_000,
    rateLimitFailOpen = false,
  } = options;

  const fastify = Fastify({
    logger: options.logger ?? false,
  });

  // Decorate fastify with prisma and queue for route access
  fastify.decorate("prisma", prisma);
  fastify.decorate("queue", queue);

  // Health check endpoint (not rate-limited — registered outside webhookRoutes)
  fastify.get("/health", async (): Promise<HealthCheckResponse> => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: `${APP_NAME}-api`,
    };
  });

  // Register webhook routes (rate limiting is applied inside this plugin,
  // after authentication, so req.project is available for keyGenerator)
  await fastify.register(webhookRoutes, {
    redis,
    rateLimitMax,
    rateLimitWindowMs,
    rateLimitFailOpen,
  });

  return fastify;
}
