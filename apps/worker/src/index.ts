import { Worker, QUEUE_NAMES, type WebhookDeliveryJobData } from "@repo/queue";
import { APP_NAME } from "@repo/shared";
import { createPrismaClient } from "@repo/db";
import { validateEnv } from "./env.js";
import { processWebhookDelivery } from "./processor.js";
import { createLogger } from "./logger.js";
import { createShutdownHandler } from "./shutdown.js";

const env = validateEnv();
const logger = createLogger(env);

async function main() {
  logger.info(
    {
      appName: APP_NAME,
      redisHost: env.REDIS_HOST,
      redisPort: env.REDIS_PORT,
      queue: QUEUE_NAMES.WEBHOOK_DELIVERY,
    },
    "Worker starting"
  );

  // Initialise Prisma client (connected lazily on first query)
  const prisma = createPrismaClient();

  // Create BullMQ worker
  const worker = new Worker<WebhookDeliveryJobData>(
    QUEUE_NAMES.WEBHOOK_DELIVERY,
    async (job) => {
      await processWebhookDelivery(job, { logger, prisma });
    },
    {
      connection: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        maxRetriesPerRequest: null,
      },
      concurrency: 10, // Process up to 10 jobs in parallel
    }
  );

  // Worker event handlers
  worker.on("ready", () => {
    logger.info("Worker is ready and listening for jobs");
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

  const shutdown = createShutdownHandler(
    worker,
    prisma,
    logger,
    env.SHUTDOWN_TIMEOUT_MS
  );

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info(
    {
      appName: APP_NAME,
      redisHost: env.REDIS_HOST,
      redisPort: env.REDIS_PORT,
      queue: QUEUE_NAMES.WEBHOOK_DELIVERY,
    },
    "Worker ready and processing jobs"
  );
}

main().catch((err) => {
  logger.error(
    { error: err.message, stack: err.stack },
    "Worker failed to start"
  );
  process.exit(1);
});
