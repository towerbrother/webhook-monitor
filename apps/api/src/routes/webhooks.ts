import type { FastifyInstance } from "fastify";
import { Prisma, isIdempotencyConflict } from "@repo/db";
import { authenticateProject } from "../middleware/authenticate-project.js";
import { enqueueWebhookDelivery } from "@repo/queue";
import { z } from "zod";

// Validation schemas
const EndpointParamsSchema = z.object({
  endpointId: z.string().min(1, "endpointId must not be empty"),
});

const IdempotencyKeySchema = z
  .string()
  .max(255, "Idempotency key must not exceed 255 characters");

const EventsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

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
export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply authentication middleware to all webhook routes
  fastify.addHook("preHandler", authenticateProject);

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
   * GET /webhooks/:endpointId/events
   * List events for a specific endpoint with pagination
   */
  fastify.get<{
    Params: { endpointId: string };
    Querystring: { limit?: number; cursor?: string };
  }>("/webhooks/:endpointId/events", async (request, reply) => {
    // Validate params
    const paramsValidation = EndpointParamsSchema.safeParse(request.params);
    if (!paramsValidation.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Invalid endpoint ID",
        details: paramsValidation.error.issues,
      });
    }

    // Validate query params
    const queryValidation = EventsQuerySchema.safeParse(request.query);
    if (!queryValidation.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Invalid pagination parameters",
        details: queryValidation.error.issues,
      });
    }

    const { endpointId } = paramsValidation.data;
    const { limit, cursor } = queryValidation.data;
    const { project } = request;

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

    // Fetch events
    const events = await fastify.prisma.event.findMany({
      take: limit + 1, // Fetch one extra to determine if there are more
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0, // Skip the cursor itself if present
      where: {
        endpointId: endpoint.id,
        projectId: project.id,
      },
      orderBy: {
        receivedAt: "desc",
      },
      select: {
        id: true,
        status: true,
        idempotencyKey: true,
        receivedAt: true,
        headers: true,
      },
    });

    const hasNextPage = events.length > limit;
    const results = hasNextPage ? events.slice(0, limit) : events;
    const nextCursor =
      hasNextPage && results.length > 0
        ? results[results.length - 1]?.id
        : undefined;

    return reply.status(200).send({
      data: results,
      pagination: {
        limit,
        nextCursor,
        hasNextPage,
      },
    });
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
