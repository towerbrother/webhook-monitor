import http from "node:http";
import { Worker, QUEUE_NAMES, type WebhookDeliveryJobData } from "@repo/queue";
import { APP_NAME, registry } from "@repo/shared";
import { createPrismaClient } from "@repo/db";
import { validateEnv } from "./env.js";
import { processWebhookDelivery } from "./processor.js";
import { createLogger } from "./logger.js";

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

  // Minimal HTTP server for Prometheus metrics scraping
  const metricsServer = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/metrics") {
      const output = await registry.metrics();
      res.writeHead(200, { "Content-Type": registry.contentType });
      res.end(output);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  metricsServer.listen(env.METRICS_PORT, () => {
    logger.info(
      { port: env.METRICS_PORT },
      "Metrics server listening"
    );
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(
      { signal },
      "Received shutdown signal, shutting down gracefully"
    );
    metricsServer.close();
    await worker.close();
    await prisma.$disconnect();
    logger.info("Worker stopped");
    process.exit(0);
  };

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
