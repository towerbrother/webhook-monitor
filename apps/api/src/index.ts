import { APP_NAME } from "@repo/shared";
import { validateEnv } from "./env.js";
import { buildApp } from "./app.js";
import { createPrismaClient } from "@repo/db";
import { createWebhookDeliveryQueue } from "@repo/queue";

const env = validateEnv();

async function main() {
  // Create database client with environment-appropriate logging
  const prisma = createPrismaClient({
    logQueries: env.NODE_ENV === "development",
  });

  await prisma.$connect();

  // Create queue with Redis configuration
  const queue = createWebhookDeliveryQueue({
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      maxRetriesPerRequest: null,
    },
  });

  const fastify = await buildApp({
    prisma,
    queue,
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
        },
      },
    },
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    await fastify.close();
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await fastify.listen({ port: env.PORT, host: env.HOST });
    console.log(`
╔══════════════════════════════════════════════╗
║  🚀 ${APP_NAME.toUpperCase()} API STARTED    ║
║  📡 Listening on http://${env.HOST}:${env.PORT}      ║
║  ❤️ Health: http://localhost:${env.PORT}/health  ║
╚══════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    await queue.close();
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
