import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { z } from "zod";

const ProjectBodySchema = z.object({
  name: z.string().min(1, "Name must not be empty"),
});

const ProjectParamsSchema = z.object({
  projectId: z.string().min(1, "projectId must not be empty"),
});

function maskProjectKey(projectKey: string): string {
  return projectKey.slice(0, 8) + "..." + projectKey.slice(-4);
}

export async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: unknown }>("/projects", async (request, reply) => {
    const validation = ProjectBodySchema.safeParse(request.body);
    if (!validation.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: validation.error.issues[0]?.message ?? "Invalid request body",
        details: validation.error.issues,
      });
    }

    const { name } = validation.data;
    const projectKey = randomUUID();

    const project = await fastify.prisma.project.create({
      data: { name, projectKey },
      select: { id: true, name: true, projectKey: true, createdAt: true },
    });

    return reply.status(201).send(project);
  });

  fastify.get("/projects", async (_request, reply) => {
    const projects = await fastify.prisma.project.findMany({
      select: { id: true, name: true, projectKey: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const masked = projects.map(({ projectKey, ...rest }) => ({
      ...rest,
      maskedKey: maskProjectKey(projectKey),
    }));

    return reply.status(200).send(masked);
  });

  fastify.delete<{ Params: { projectId: string } }>(
    "/projects/:projectId",
    async (request, reply) => {
      const paramsValidation = ProjectParamsSchema.safeParse(request.params);
      if (!paramsValidation.success) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Invalid project ID",
          details: paramsValidation.error.issues,
        });
      }

      const { projectId } = paramsValidation.data;

      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });

      if (!project) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Project not found",
        });
      }

      await fastify.prisma.project.delete({ where: { id: projectId } });

      return reply.status(204).send();
    }
  );
}
