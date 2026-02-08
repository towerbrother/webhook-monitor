import { Redis } from "ioredis";
import { APP_NAME } from "@webhook-monitor/shared";
import { validateEnv } from "./env.js";

const env = validateEnv();
const REDIS_HOST = env.REDIS_HOST;
const REDIS_PORT = env.REDIS_PORT;

async function main() {
  console.log(`
╔════════════════════════════════════════════╗
║  🔧 ${APP_NAME.toUpperCase()} WORKER STARTING...      ║
╚════════════════════════════════════════════╝
  `);

  // Create Redis connection to verify connectivity
  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n📴 Received ${signal}, shutting down gracefully...`);
    await redis.quit();
    console.log("👋 Worker stopped");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await redis.connect();
    console.log(`✅ Connected to Redis at ${REDIS_HOST}:${REDIS_PORT}`);

    // Ping to verify connection
    const pong = await redis.ping();
    console.log(`🏓 Redis ping: ${pong}`);

    console.log(`
╔════════════════════════════════════════════╗
║  ✅ ${APP_NAME.toUpperCase()} WORKER READY            ║
║  📡 Redis: ${REDIS_HOST}:${REDIS_PORT}                    ║
║  ⏳ Waiting for jobs...                    ║
╚════════════════════════════════════════════╝
    `);

    // Keep the process alive
    // In production, workers would be processing jobs here
    // For now, we just wait
    await new Promise(() => {});
  } catch (err) {
    console.error("❌ Failed to connect to Redis:", err);
    process.exit(1);
  }
}

main();
