import { Worker, QUEUE_NAMES, type WebhookDeliveryJobData } from "@repo/queue";
import { APP_NAME } from "@repo/shared";
import { createPrismaClient } from "@repo/db";
import { validateEnv } from "./env.js";
import { processWebhookDelivery } from "./processor.js";
import { RedisOptions } from "bullmq";
import { logger } from "./logger.js";

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

    logger.info(
      {
        service: APP_NAME,
        redis: `${env.REDIS_HOST}:${env.REDIS_PORT}`,
        queue: QUEUE_NAMES.WEBHOOK_DELIVERY,
      },
      "Worker starting..."
    );

    const worker = createWorker();
    const prisma = createPrismaClient();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, "Received signal, shutting down gracefully...");
      await worker.close();
      await prisma.$disconnect();
      logger.info({}, "Worker stopped");
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    logger.info({}, "Worker ready and processing jobs");
  }

  main().catch((err) => {
    logger.fatal({ err }, "Worker failed to start");
    process.exit(1);
  });
}
