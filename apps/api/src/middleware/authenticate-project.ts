import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Middleware to authenticate webhook requests using project key.
 *
 * Extracts project key from X-Project-Key header and validates it against the database.
 * Attaches the resolved Project to the request object for downstream use.
 *
 * @throws 401 Unauthorized if key is missing
 * @throws 403 Forbidden if key is invalid
 */
export async function authenticateProject(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const projectKey = request.headers["x-project-key"] as string | undefined;

  if (!projectKey) {
    return reply.status(401).send({
      error: "Unauthorized",
      message: "Missing X-Project-Key header",
    });
  }

  const project = await request.server.prisma.project.findUnique({
    where: { projectKey },
  });

  if (!project) {
    return reply.status(403).send({
      error: "Forbidden",
      message: "Invalid project key",
    });
  }

  // Attach project to request for use in route handlers
  request.project = project;
}
