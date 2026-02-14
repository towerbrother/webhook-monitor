import type { Project, PrismaClient } from "@repo/db";
import type { Queue, WebhookDeliveryJobData } from "@repo/queue";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    queue: Queue<WebhookDeliveryJobData>;
  }
  interface FastifyRequest {
    project: Project;
  }
}
