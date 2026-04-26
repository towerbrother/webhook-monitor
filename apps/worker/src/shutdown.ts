import type { Worker } from "@repo/queue";
import type { PrismaClient } from "@repo/db";
import type { Logger } from "./logger.js";

export function createShutdownHandler(
  worker: Worker,
  prisma: PrismaClient,
  logger: Logger,
  timeoutMs: number
) {
  return async (signal: string): Promise<void> => {
    logger.info({ signal }, "Received shutdown signal, shutting down gracefully");

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Shutdown timeout exceeded")),
        timeoutMs
      )
    );

    try {
      await Promise.race([
        (async () => {
          await worker.close();
          await prisma.$disconnect();
        })(),
        timeout,
      ]);
      logger.info({ signal }, "Worker stopped");
      process.exit(0);
    } catch {
      logger.error({ signal }, "Shutdown timeout exceeded, force exiting");
      process.exit(1);
    }
  };
}
