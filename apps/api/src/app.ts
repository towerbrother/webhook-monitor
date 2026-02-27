import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@repo/db";
import type { Queue, WebhookDeliveryJobData } from "@repo/queue";
import { APP_NAME, type HealthCheckResponse } from "@repo/shared";
import { webhookRoutes } from "./routes/webhooks.js";
import fastifyRateLimit from "@fastify/rate-limit";
import { validateEnv } from "./env.js";
import { Redis } from "ioredis";

const env = validateEnv();

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

  // Create Redis client for rate limiting
  const redisClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
      if (times > 3) {
        return null; // Stop retrying
      }
      return Math.min(times * 50, 2000);
    },
  });

  // Handle Redis errors to prevent crash
  redisClient.on("error", (err) => {
    fastify.log.error({ err }, "Redis rate limit error");
  });

  // Register rate limiting
  await fastify.register(fastifyRateLimit, {
    max: (req) => {
      // Stricter limit if no project key provided
      const key = req.headers["x-project-key"];
      if (!key) {
        return 10;
      }
      return env.RATE_LIMIT_MAX;
    },
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    keyGenerator: (req) => {
      // Use project key header if available, fallback to IP
      const key = req.headers["x-project-key"];
      // Fallback to IP if key is missing or is not a string
      return typeof key === "string" ? key : req.ip;
    },
    // The rate limit plugin documentation suggests that for some versions,
    // particularly v5+, 404s might not trigger the rate limit unless
    // specifically configured or if the plugin is registered globally.
    // Since we register it globally, it should work.
    // However, if the route is not found, Fastify might skip some hooks.
    // Let's ensure we are testing a valid route in the test for unauthenticated user.

    allowList: ["/health", "/metrics"], // Exclude health and metrics
    redis: redisClient,
    skipOnError: true, // Always fail open
    errorResponseBuilder: (req, context) => {
      return {
        statusCode: 429,
        error: "Too Many Requests",
        message: `Rate limit exceeded, retry in ${context.after}`,
        retryAfter: context.after,
      };
    },
    // Ensure we are using a version of fastify-rate-limit that supports this
    // It seems 'addHeaders' is the correct config, but maybe 'enableDraftSpec'
    // is interfering or the version installed behaves differently.
    // Let's try explicit boolean configuration as per docs for some versions.
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
  });

  // Cleanup redis client when fastify closes
  fastify.addHook("onClose", async () => {
    await redisClient.quit();
  });

  // Register webhook routes
  await fastify.register(webhookRoutes);

  return fastify;
}
