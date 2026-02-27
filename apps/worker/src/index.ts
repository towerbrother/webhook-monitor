import { Worker, QUEUE_NAMES, type WebhookDeliveryJobData } from "@repo/queue";
import { APP_NAME } from "@repo/shared";
import { createPrismaClient } from "@repo/db";
import { validateEnv } from "./env.js";
import { processWebhookDelivery } from "./processor.js";
import { RedisOptions } from "bullmq";

// Simple console logger (Step 7 will add Pino)
export const logger = {
  info: (obj: Record<string, unknown>, msg: string) =>
    console.log(JSON.stringify({ level: "info", msg, ...obj })),
  error: (obj: Record<string, unknown>, msg: string) =>
    console.error(JSON.stringify({ level: "error", msg, ...obj })),
};

export const createWorker = (options?: { connection: RedisOptions }) => {
  // Validate env lazily or assume it's valid if connection is provided
  // But for the default connection we need env.

  let redisConnection = options?.connection;

  if (!redisConnection) {
    const env = validateEnv();
    redisConnection = {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      maxRetriesPerRequest: null,
    };
  }

  // Initialise Prisma client (connected lazily on first query)
  const prisma = createPrismaClient();

  // Create BullMQ worker
  const worker = new Worker<WebhookDeliveryJobData>(
    QUEUE_NAMES.WEBHOOK_DELIVERY,
    async (job) => {
      await processWebhookDelivery(job, { logger, prisma });
    },
    {
      connection: redisConnection,
      concurrency: 10, // Process up to 10 jobs in parallel
    }
  );

  // Worker event handlers
  worker.on("ready", () => {
    logger.info({}, "Worker is ready and listening for jobs");
  });

  worker.on("completed", (job) => {
    logger.info(
      { jobId: job.id, eventId: job.data.eventId },
      "Job completed successfully"
    );
  });

  worker.on("failed", (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        eventId: job?.data.eventId,
        error: err.message,
        attempt: job?.attemptsMade,
      },
      "Job failed"
    );
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Worker error");
  });

  return worker;
};

if (require.main === module) {
  async function main() {
    const env = validateEnv();

    console.log(`
  ╔════════════════════════════════════════════╗
  ║  🔧 ${APP_NAME.toUpperCase()} WORKER STARTING...      ║
  ╚════════════════════════════════════════════╝
    `);

    const worker = createWorker();
    const prisma = createPrismaClient();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n📴 Received ${signal}, shutting down gracefully...`);
      await worker.close();
      await prisma.$disconnect();
      console.log("👋 Worker stopped");
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    console.log(`
  ╔════════════════════════════════════════════╗
  ║  ✅ ${APP_NAME.toUpperCase()} WORKER READY            ║
  ║  📡 Redis: ${env.REDIS_HOST}:${env.REDIS_PORT}                    ║
  ║  📋 Queue: ${QUEUE_NAMES.WEBHOOK_DELIVERY}           ║
  ║  ⏳ Processing jobs...                     ║
  ╚════════════════════════════════════════════╝
    `);
  }

  main().catch((err) => {
    console.error("❌ Worker failed to start:", err);
    process.exit(1);
  });
}
