import { Worker, QUEUE_NAMES, type WebhookDeliveryJobData } from "@repo/queue";
import { APP_NAME } from "@repo/shared";
import { validateEnv } from "./env.js";
import { processWebhookDelivery } from "./processor.js";

const env = validateEnv();

// Simple console logger (Step 7 will add Pino)
const logger = {
  info: (obj: Record<string, unknown>, msg: string) =>
    console.log(JSON.stringify({ level: "info", msg, ...obj })),
  error: (obj: Record<string, unknown>, msg: string) =>
    console.error(JSON.stringify({ level: "error", msg, ...obj })),
};

async function main() {
  console.log(`
╔════════════════════════════════════════════╗
║  🔧 ${APP_NAME.toUpperCase()} WORKER STARTING...      ║
╚════════════════════════════════════════════╝
  `);

  // Create BullMQ worker
  const worker = new Worker<WebhookDeliveryJobData>(
    QUEUE_NAMES.WEBHOOK_DELIVERY,
    async (job) => {
      await processWebhookDelivery(job, { logger });
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

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n📴 Received ${signal}, shutting down gracefully...`);
    await worker.close();
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
