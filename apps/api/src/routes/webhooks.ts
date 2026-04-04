import type { FastifyInstance } from "fastify";
import { Prisma, isIdempotencyConflict } from "@repo/db";
import { authenticateProject } from "../middleware/authenticate-project.js";
import { enqueueWebhookDelivery } from "@repo/queue";
import { z } from "zod";
import type { Redis } from "ioredis";
import fastifyRateLimit from "@fastify/rate-limit";
import { makeRateLimitStoreClass } from "../plugins/redis-rate-limit-store.js";

export interface WebhookRouteOptions {
  redis?: Redis;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  rateLimitFailOpen: boolean;
}

// Validation schemas
const EndpointParamsSchema = z.object({
  endpointId: z.string().min(1, "endpointId must not be empty"),
});

const IdempotencyKeySchema = z
  .string()
  .max(255, "Idempotency key must not exceed 255 characters");

/**
 * Extract and validate idempotency key from request headers
 * Returns undefined if header is not present
 */
function extractIdempotencyKey(
  headers: Record<string, unknown>
): string | undefined {
  const key = headers["x-idempotency-key"];

  if (key === undefined || key === null) {
    return undefined;
  }

  // Handle array values (multiple headers with same name)
  const keyValue = Array.isArray(key) ? key[0] : String(key);

  // Return undefined for empty strings
  if (keyValue.trim() === "") {
    return undefined;
  }

  return keyValue;
}

/**
 * Webhook ingestion routes
 * All routes require project authentication via X-Project-Key header
 */
export async function webhookRoutes(
  fastify: FastifyInstance,
  options: WebhookRouteOptions
): Promise<void> {
  // Apply authentication middleware first so req.project is available
  // for the rate-limit keyGenerator registered below
  fastify.addHook("preHandler", authenticateProject);

  // Rate limiting — registered after auth so req.project is populated.
  // /health is outside this plugin scope and is never rate-limited.
  if (options.redis) {
    const { rateLimitMax, rateLimitWindowMs, rateLimitFailOpen } = options;
    const StoreClass = makeRateLimitStoreClass(
      options.redis,
      rateLimitWindowMs,
      rateLimitFailOpen,
      Math.floor(rateLimitMax / 10)
    );

    await fastify.register(fastifyRateLimit, {
      // Store is built as a class; cast required because the closure-based
      // class constructor signature differs from the generic ctor type.
      store: StoreClass as unknown as import("@fastify/rate-limit").FastifyRateLimitStoreCtor,
      // Run as preHandler so auth has already set req.project before this
      // executes — the default onRequest hook runs before authentication.
      hook: "preHandler",
      timeWindow: rateLimitWindowMs,
      max: (req, _key) =>
        req.project
          ? rateLimitMax
          : Math.max(1, Math.floor(rateLimitMax / 10)),
      keyGenerator: (req) =>
        req.project?.id ?? `unauthenticated:${req.ip ?? "unknown"}`,
    });
  }

  /**
   * POST /webhooks/:endpointId
   * Receive a webhook event for a specific endpoint
   */
  fastify.post<{
    Params: { endpointId: string };
    Body: unknown;
  }>("/webhooks/:endpointId", async (request, reply) => {
    // Validate params
    const paramsValidation = EndpointParamsSchema.safeParse(request.params);
    if (!paramsValidation.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Invalid endpoint ID",
        details: paramsValidation.error.issues,
      });
    }

    const { endpointId } = paramsValidation.data;
    const { project } = request; // Attached by authenticateProject middleware

    // Extract and validate idempotency key
    const idempotencyKey = extractIdempotencyKey(request.headers);

    if (idempotencyKey !== undefined) {
      const keyValidation = IdempotencyKeySchema.safeParse(idempotencyKey);

      if (!keyValidation.success) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Invalid idempotency key",
          details: keyValidation.error.issues,
        });
      }
    }

    // Verify endpoint belongs to the authenticated project
    const endpoint = await fastify.prisma.webhookEndpoint.findFirst({
      where: {
        id: endpointId,
        projectId: project.id,
      },
    });

    if (!endpoint) {
      return reply.status(404).send({
        error: "Not Found",
        message:
          "Webhook endpoint not found or does not belong to this project",
      });
    }

    try {
      // Create event record with idempotency key if provided
      const event = await fastify.prisma.event.create({
        data: {
          endpointId: endpoint.id,
          projectId: project.id,
          method: request.method,
          headers: request.headers as Prisma.InputJsonValue,
          body: (request.body as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          ...(idempotencyKey && { idempotencyKey }),
        },
      });

      // Enqueue delivery job (fire-and-forget, don't block response)
      // In production, consider handling enqueue failures
      enqueueWebhookDelivery(fastify.queue, {
        eventId: event.id,
        projectId: project.id,
        endpointId: endpoint.id,
        url: endpoint.url,
        method: request.method,
        headers: request.headers as Record<string, unknown>,
        body: request.body,
        attempt: 1,
        correlationId: request.id,
      }).catch((err: unknown) => {
        // Log error but don't fail the request
        fastify.log.error(
          { err, eventId: event.id },
          "Failed to enqueue webhook delivery"
        );
      });

      return reply.status(201).send({
        success: true,
        eventId: event.id,
        receivedAt: event.receivedAt,
      });
    } catch (error: unknown) {
      // Handle idempotency key conflict (P2002 unique constraint violation)
      if (isIdempotencyConflict(error) && idempotencyKey) {
        // Find the existing event with this idempotency key
        const existingEvent = await fastify.prisma.event.findFirst({
          where: {
            projectId: project.id,
            idempotencyKey: idempotencyKey,
          },
        });

        if (existingEvent) {
          // Return the existing event with a 409 status
          return reply.status(409).send({
            success: true,
            eventId: existingEvent.id,
            receivedAt: existingEvent.receivedAt,
            duplicate: true,
          });
        }
      }

      // Re-throw any other error
      throw error;
    }
  });

  /**
   * POST /webhooks
   * Receive a webhook event (project-wide, not tied to specific endpoint)
   */
  fastify.post<{
    Body: unknown;
  }>("/webhooks", async (request, reply) => {
    const { project } = request; // Attached by authenticateProject middleware

    // For project-wide webhooks, you might want to create a default endpoint
    // or handle differently. For now, returning a simple success response.

    return reply.status(200).send({
      success: true,
      message: "Webhook received for project",
      projectId: project.id,
      projectName: project.name,
    });
  });
}
