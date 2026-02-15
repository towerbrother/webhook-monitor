import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@repo/db";
import type { Queue, WebhookDeliveryJobData } from "@repo/queue";
import { APP_NAME, type HealthCheckResponse } from "@repo/shared";
import { webhookRoutes } from "./routes/webhooks.js";

export interface AppOptions {
  prisma: PrismaClient;
  queue: Queue<WebhookDeliveryJobData>;
  logger?: boolean | object;
}

/**
 * Creates and configures a Fastify application instance.
 * Extracted for testability - allows creating app without starting server.
 */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { prisma, queue } = options;

  const fastify = Fastify({
    logger: options.logger ?? false,
  });

  // Decorate fastify with prisma and queue for route access
  fastify.decorate("prisma", prisma);
  fastify.decorate("queue", queue);

  // Health check endpoint
  fastify.get("/health", async (): Promise<HealthCheckResponse> => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: `${APP_NAME}-api`,
    };
  });

  // Register webhook routes
  await fastify.register(webhookRoutes);

  return fastify;
}
