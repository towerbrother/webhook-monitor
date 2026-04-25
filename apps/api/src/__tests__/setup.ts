/**
 * Test setup for @repo/api
 *
 * Provides database connection lifecycle and cleanup hooks.
 * Reuses helpers from @repo/db for test data creation.
 */

import { beforeAll, afterAll, beforeEach } from "vitest";
import { createPrismaClient, type PrismaClient } from "@repo/db";

// Isolate tests on a separate Redis DB so a locally-running worker
// (e.g. docker compose, `pnpm dev`) on db 0 cannot consume test jobs.
process.env.REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
process.env.REDIS_PORT = process.env.REDIS_PORT ?? "6379";
process.env.REDIS_DB = process.env.REDIS_DB ?? "1";

let prisma: PrismaClient | undefined;

export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    throw new Error("Test prisma client not initialized");
  }

  return prisma;
}

/**
 * Connect to database before all tests
 */
beforeAll(async () => {
  // Skip tests if DATABASE_URL is not set
  if (!process.env.DATABASE_URL) {
    console.warn(
      "⚠️  DATABASE_URL not set. Skipping API tests.\n" +
        "   To run tests, set DATABASE_URL in your environment or .env file.\n" +
        "   Example: postgresql://postgres:postgres@localhost:5432/webhook_monitor_test"
    );
    return;
  }

  prisma = createPrismaClient({ logQueries: false });
  await prisma.$connect();
});

/**
 * Clean up test data before each test for isolation
 */
beforeEach(async () => {
  if (!prisma) {
    return;
  }

  // Delete in dependency order (most dependent first)
  await prisma.event.deleteMany({});
  await prisma.webhookEndpoint.deleteMany({});
  await prisma.project.deleteMany({});
});

/**
 * Disconnect from database after all tests
 */
afterAll(async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
});
