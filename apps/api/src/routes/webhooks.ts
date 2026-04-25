import type { FastifyInstance } from "fastify";
import { Prisma, isIdempotencyConflict, EventStatus } from "@repo/db";
import { authenticateProject } from "../middleware/authenticate-project.js";
import { enqueueWebhookDelivery } from "@repo/queue";
import { verifyWebhookSignature } from "@repo/shared";
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

const EventParamsSchema = z.object({
  endpointId: z.string().min(1, "endpointId must not be empty"),
  eventId: z.string().min(1, "eventId must not be empty"),
});

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

const REPLAY_RATE_LIMIT_MAX = 10;
const REPLAY_RATE_LIMIT_WINDOW_MS = 60_000;

interface ReplayRateLimitEntry {
  count: number;
  windowStart: number;
}

function makeReplayRateLimiter() {
  const counters = new Map<string, ReplayRateLimitEntry>();

  return function consume(projectId: string): boolean {
    const now = Date.now();
    const entry = counters.get(projectId);

    if (!entry || now - entry.windowStart >= REPLAY_RATE_LIMIT_WINDOW_MS) {
      counters.set(projectId, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= REPLAY_RATE_LIMIT_MAX) {
      return false;
    }

    entry.count++;
    return true;
  };
}

const EventListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE, `Page size exceeds maximum of ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
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
export async function webhookRoutes(
  fastify: FastifyInstance,
  options: WebhookRouteOptions
): Promise<void> {
  // Apply authentication middleware first so req.project is available
  // for the rate-limit keyGenerator registered below
  fastify.addHook("preHandler", authenticateProject);

  const consumeReplayRateLimit = makeReplayRateLimiter();

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
      store:
        StoreClass as unknown as import("@fastify/rate-limit").FastifyRateLimitStoreCtor,
      // Run as preHandler so auth has already set req.project before this
      // executes — the default onRequest hook runs before authentication.
      hook: "preHandler",
      timeWindow: rateLimitWindowMs,
      max: (req, _key) =>
        req.project ? rateLimitMax : Math.max(1, Math.floor(rateLimitMax / 10)),
      keyGenerator: (req) =>
        req.project?.id ?? `unauthenticated:${req.ip ?? "unknown"}`,
    });
  }

  // Parse all incoming bodies as raw Buffer so HMAC can be verified against
  // the exact bytes the sender signed. JSON body storage is handled manually
  // in the route handler via JSON.parse.
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser(
    "*",
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    }
  );

  /**
   * POST /webhooks/:endpointId
   * Receive a webhook event for a specific endpoint
   */
  fastify.post<{
    Params: { endpointId: string };
    Body: Buffer;
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

    // Raw bytes — needed for HMAC verification and stored body
    const rawBody: Buffer =
      request.body instanceof Buffer ? request.body : Buffer.alloc(0);

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

    // Verify endpoint belongs to the authenticated project.
    // Include signingSecret so HMAC can be verified before event creation.
    const endpoint = await fastify.prisma.webhookEndpoint.findFirst({
      where: {
        id: endpointId,
        projectId: project.id,
      },
      select: {
        id: true,
        url: true,
        signingSecret: true,
      },
    });

    if (!endpoint) {
      return reply.status(404).send({
        error: "Not Found",
        message:
          "Webhook endpoint not found or does not belong to this project",
      });
    }

    // HMAC signature verification — only when endpoint has a signingSecret
    if (endpoint.signingSecret) {
      const sigHeader = request.headers["x-hub-signature-256"];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

      if (
        !sig ||
        !verifyWebhookSignature(rawBody, sig, endpoint.signingSecret)
      ) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Invalid webhook signature",
        });
      }
    }

    // Parse body for storage: try JSON, fall back to raw string, then null
    let parsedBody: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      Prisma.JsonNull;
    if (rawBody.length > 0) {
      try {
        parsedBody = JSON.parse(rawBody.toString("utf8")) as Prisma.InputJsonValue;
      } catch {
        parsedBody = rawBody.toString("utf8") as Prisma.InputJsonValue;
      }
    }

    try {
      // Create event record with idempotency key if provided
      const event = await fastify.prisma.event.create({
        data: {
          endpointId: endpoint.id,
          projectId: project.id,
          method: request.method,
          headers: request.headers as Prisma.InputJsonValue,
          body: parsedBody,
          ...(idempotencyKey && { idempotencyKey }),
        },
      });

      // Enqueue delivery job (fire-and-forget, don't block response)
      enqueueWebhookDelivery(fastify.queue, {
        eventId: event.id,
        projectId: project.id,
        endpointId: endpoint.id,
        url: endpoint.url,
        method: request.method,
        headers: request.headers as Record<string, unknown>,
        body: parsedBody,
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
   * List events for a specific endpoint, scoped to the authenticated project.
   */
  fastify.get<{
    Params: { endpointId: string };
    Querystring: { limit?: string; cursor?: string };
  }>("/webhooks/:endpointId/events", async (request, reply) => {
    const paramsValidation = EndpointParamsSchema.safeParse(request.params);
    if (!paramsValidation.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Invalid endpoint ID",
        details: paramsValidation.error.issues,
      });
    }

    const queryValidation = EventListQuerySchema.safeParse(request.query);
    if (!queryValidation.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: queryValidation.error.issues[0]?.message ?? "Invalid query",
        details: queryValidation.error.issues,
      });
    }

    const { endpointId } = paramsValidation.data;
    const { limit, cursor } = queryValidation.data;
    const { project } = request;

    const endpoint = await fastify.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, projectId: project.id },
      select: { id: true },
    });

    if (!endpoint) {
      return reply.status(404).send({
        error: "Not Found",
        message:
          "Webhook endpoint not found or does not belong to this project",
      });
    }

    // Fetch limit+1 to detect whether more pages exist
    const rows = await fastify.prisma.event.findMany({
      where: {
        endpointId,
        projectId: project.id,
      },
      select: {
        id: true,
        status: true,
        idempotencyKey: true,
        receivedAt: true,
        method: true,
        headers: true,
      },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? events[events.length - 1]!.id : null;

    return reply.status(200).send({ events, nextCursor });
  });

  /**
   * GET /webhooks/:endpointId/events/:eventId
   * Return full event detail with delivery attempts, scoped to the authenticated project.
   */
  fastify.get<{
    Params: { endpointId: string; eventId: string };
  }>("/webhooks/:endpointId/events/:eventId", async (request, reply) => {
    const paramsValidation = EventParamsSchema.safeParse(request.params);
    if (!paramsValidation.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Invalid parameters",
        details: paramsValidation.error.issues,
      });
    }

    const { endpointId, eventId } = paramsValidation.data;
    const { project } = request;

    const event = await fastify.prisma.event.findFirst({
      where: {
        id: eventId,
        projectId: project.id,
        endpointId,
      },
      select: {
        id: true,
        status: true,
        idempotencyKey: true,
        receivedAt: true,
        method: true,
        headers: true,
        body: true,
        deliveryAttempts: {
          select: {
            id: true,
            attemptNumber: true,
            requestedAt: true,
            respondedAt: true,
            statusCode: true,
            success: true,
            errorMessage: true,
          },
          orderBy: { attemptNumber: "asc" },
        },
      },
    });

    if (!event) {
      return reply.status(404).send({
        error: "Not Found",
        message: "Event not found or does not belong to this endpoint",
      });
    }

    return reply.status(200).send(event);
  });

  /**
   * POST /webhooks/:endpointId/events/:eventId/replay
   * Re-enqueue a FAILED event. Rate-limited to 10 replays/min per project.
   */
  fastify.post<{
    Params: { endpointId: string; eventId: string };
  }>("/webhooks/:endpointId/events/:eventId/replay", async (request, reply) => {
    const paramsValidation = EventParamsSchema.safeParse(request.params);
    if (!paramsValidation.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Invalid parameters",
        details: paramsValidation.error.issues,
      });
    }

    const { endpointId, eventId } = paramsValidation.data;
    const { project } = request;

    const event = await fastify.prisma.event.findFirst({
      where: { id: eventId, projectId: project.id, endpointId },
      select: {
        id: true,
        status: true,
        endpointId: true,
        method: true,
        headers: true,
        body: true,
        endpoint: { select: { url: true } },
      },
    });

    if (!event) {
      return reply.status(404).send({
        error: "Not Found",
        message: "Event not found or does not belong to this endpoint",
      });
    }

    if (!consumeReplayRateLimit(project.id)) {
      return reply.status(429).send({
        error: "Too Many Requests",
        message: "Replay rate limit exceeded. Maximum 10 replays per minute per project.",
      });
    }

    if (event.status === EventStatus.DELIVERED) {
      return reply.status(200).send({ queued: false, message: "Already delivered" });
    }

    if (
      event.status === EventStatus.PENDING ||
      event.status === EventStatus.RETRYING
    ) {
      return reply.status(200).send({ queued: false, message: "Already in progress" });
    }

    // FAILED: log, reset to PENDING, enqueue
    fastify.log.info(
      { eventId: event.id, projectId: project.id, correlationId: request.id, action: "replay" },
      "Replaying failed event"
    );

    await fastify.prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.PENDING },
    });

    enqueueWebhookDelivery(fastify.queue, {
      eventId: event.id,
      projectId: project.id,
      endpointId: event.endpointId,
      url: event.endpoint.url,
      method: event.method,
      headers: event.headers as Record<string, unknown>,
      body: event.body,
      attempt: 1,
      correlationId: request.id,
    }).catch((err: unknown) => {
      fastify.log.error({ err, eventId: event.id }, "Failed to enqueue replay job");
    });

    return reply.status(202).send({ queued: true, eventId: event.id });
  });
}
