import type { Project } from "@repo/db";

declare module "fastify" {
  interface FastifyRequest {
    project: Project;
  }
}
