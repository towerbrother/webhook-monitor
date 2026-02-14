import Fastify, { type FastifyInstance } from "fastify";
import { APP_NAME, type HealthCheckResponse } from "@repo/shared";
import { webhookRoutes } from "./routes/webhooks.js";

export interface AppOptions {
  logger?: boolean | object;
}

/**
 * Creates and configures a Fastify application instance.
 * Extracted for testability - allows creating app without starting server.
 */
export async function buildApp(
  options: AppOptions = {}
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: options.logger ?? false,
  });

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
