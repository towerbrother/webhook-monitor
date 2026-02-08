import Fastify from "fastify";
import { APP_NAME, type HealthCheckResponse } from "@repo/shared";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  const fastify = Fastify({
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

  // Health check endpoint
  fastify.get("/health", async (): Promise<HealthCheckResponse> => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: `${APP_NAME}-api`,
    };
  });

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`
╔════════════════════════════════════════════╗
║  🚀 ${APP_NAME.toUpperCase()} API STARTED             ║
║  📡 Listening on http://${HOST}:${PORT}      ║
║  ❤️  Health: http://localhost:${PORT}/health  ║
╚════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
