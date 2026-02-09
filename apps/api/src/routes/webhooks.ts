import type { FastifyInstance } from "fastify";
import { Prisma } from "@repo/db";
import { authenticateProject } from "../middleware/authenticate-project.js";
import { prisma } from "@repo/db";

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
    const { endpointId } = request.params;
    const { project } = request; // Attached by authenticateProject middleware

    // Verify endpoint belongs to the authenticated project
    const endpoint = await prisma.webhookEndpoint.findFirst({
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

    // Create event record
    const event = await prisma.event.create({
      data: {
        endpointId: endpoint.id,
        projectId: project.id,
        method: request.method,
        headers: request.headers as Prisma.InputJsonValue,
        body: (request.body as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });

    return reply.status(201).send({
      success: true,
      eventId: event.id,
      receivedAt: event.receivedAt,
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
