// This file extends Fastify's type definitions to include custom properties
// added to the Fastify instance and request objects for this webhook monitor application.
// It enables TypeScript to recognize the prisma database client and queue instance
// on the Fastify app instance, as well as project data attached to incoming requests.

import type { Project, PrismaClient, PrismaClient } from "@repo/db";
import type { Queue, WebhookDeliveryJobData } from "@repo/queue";

declare module "fastify" {
  // Extend FastifyInstance to include database and queue clients for easy access throughout the app
  interface FastifyInstance {
    prisma: PrismaClient;
    queue: Queue<WebhookDeliveryJobData>;
  }
  // Extend FastifyRequest to include project data that gets attached during request processing
  interface FastifyRequest {
    project: Project;
  }
}
