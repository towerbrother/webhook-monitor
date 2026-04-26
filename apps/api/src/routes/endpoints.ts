import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticateProject } from "../middleware/authenticate-project.js";

const EndpointBodySchema = z.object({
  url: z.string().url("Must be a valid URL"),
  name: z.string().min(1, "Name must not be empty"),
});

const EndpointParamsSchema = z.object({
  endpointId: z.string().min(1, "endpointId must not be empty"),
});

const endpointSelect = {
  id: true,
  url: true,
  name: true,
  projectId: true,
  createdAt: true,
} as const;

export async function endpointRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", authenticateProject);

  fastify.post<{ Body: unknown }>("/endpoints", async (request, reply) => {
    const validation = EndpointBodySchema.safeParse(request.body);
    if (!validation.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: validation.error.issues[0]?.message ?? "Invalid request body",
        details: validation.error.issues,
      });
    }

    const { url, name } = validation.data;
    const { project } = request;

    const endpoint = await fastify.prisma.webhookEndpoint.create({
      data: { url, name, projectId: project.id },
      select: endpointSelect,
    });

    return reply.status(201).send(endpoint);
  });

  fastify.get("/endpoints", async (request, reply) => {
    const { project } = request;

    const endpoints = await fastify.prisma.webhookEndpoint.findMany({
      where: { projectId: project.id },
      select: endpointSelect,
      orderBy: { createdAt: "desc" },
    });

    return reply.status(200).send(endpoints);
  });

  fastify.get<{ Params: { endpointId: string } }>(
    "/endpoints/:endpointId",
    async (request, reply) => {
      const paramsValidation = EndpointParamsSchema.safeParse(request.params);
      if (!paramsValidation.success) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Invalid endpoint ID",
          details: paramsValidation.error.issues,
        });
      }

      const { endpointId } = paramsValidation.data;
      const { project } = request;

      const endpoint = await fastify.prisma.webhookEndpoint.findFirst({
        where: { id: endpointId, projectId: project.id },
        select: endpointSelect,
      });

      if (!endpoint) {
        return reply.status(404).send({
          error: "Not Found",
          message:
            "Webhook endpoint not found or does not belong to this project",
        });
      }

      return reply.status(200).send(endpoint);
    }
  );

  fastify.delete<{ Params: { endpointId: string } }>(
    "/endpoints/:endpointId",
    async (request, reply) => {
      const paramsValidation = EndpointParamsSchema.safeParse(request.params);
      if (!paramsValidation.success) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Invalid endpoint ID",
          details: paramsValidation.error.issues,
        });
      }

      const { endpointId } = paramsValidation.data;
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

      await fastify.prisma.webhookEndpoint.delete({
        where: { id: endpointId },
      });

      return reply.status(204).send();
    }
  );
}
