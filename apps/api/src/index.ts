import { APP_NAME } from "@repo/shared";
import { validateEnv } from "./env.js";
import { buildApp } from "./app.js";

const env = validateEnv();
const PORT = env.PORT;
const HOST = env.HOST;

async function main() {
  const fastify = await buildApp({
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

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`
╔══════════════════════════════════════════════╗
║  🚀 ${APP_NAME.toUpperCase()} API STARTED    ║
║  📡 Listening on http://${HOST}:${PORT}      ║
║  ❤️ Health: http://localhost:${PORT}/health  ║
╚══════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
