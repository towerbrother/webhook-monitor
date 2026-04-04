import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@repo/db";
import type { Queue, WebhookDeliveryJobData } from "@repo/queue";
import { APP_NAME, type HealthCheckResponse } from "@repo/shared";
import { registry } from "@repo/shared/metrics";
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
  /** Optional bearer token to protect GET /metrics. If omitted, endpoint is open. */
  metricsAuthToken?: string;
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
    metricsAuthToken,
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

  // Prometheus metrics endpoint — registered before webhookRoutes so it is
  // excluded from project authentication and rate limiting.
  fastify.get("/metrics", async (request, reply) => {
    if (metricsAuthToken) {
      const auth = request.headers["authorization"];
      if (auth !== `Bearer ${metricsAuthToken}`) {
        return reply
          .status(401)
          .send({ error: "Unauthorized", message: "Invalid or missing token" });
      }
    }

    const output = await registry.metrics();
    return reply
      .status(200)
      .header("Content-Type", registry.contentType)
      .send(output);
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
