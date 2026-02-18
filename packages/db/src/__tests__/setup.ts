/**
 * Test setup for @repo/db
 *
 * This file runs before each test file and handles:
 * - Database connection verification
 * - Test isolation (cleanup between tests)
 */

import { beforeAll, afterAll, beforeEach } from "vitest";
import { createPrismaClient } from "../index.js";
import type { PrismaClient } from "@prisma/client";

// Test database client instance
let prisma: PrismaClient | undefined;

/**
 * Get the test database client
 * Must be called after beforeAll has run
 */
export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    throw new Error(
      "Test prisma client not initialized. Ensure setup.ts beforeAll has run."
    );
  }
  return prisma;
}

/**
 * Clean up database to ensure test isolation
 * Deletes in correct order to respect foreign key constraints
 */
async function cleanDatabase(): Promise<void> {
  if (!prisma) {
    return;
  }

  await prisma.event.deleteMany({});
  await prisma.webhookEndpoint.deleteMany({});
  await prisma.project.deleteMany({});
}

/**
 * Verify database connection before running any tests
 */
beforeAll(async () => {
  // Skip tests if DATABASE_URL is not set
  if (!process.env.DATABASE_URL) {
    console.warn(
      "⚠️  DATABASE_URL not set. Skipping database tests.\n" +
        "   To run tests, set DATABASE_URL in your environment or .env file.\n" +
        "   Example: postgresql://postgres:postgres@localhost:5432/webhook_monitor_test"
    );
    return;
  }

  prisma = createPrismaClient({ logQueries: false });
  try {
    await prisma.$connect();
  } catch (error) {
    console.error("Failed to connect to test database:", error);
    console.error(
      "Ensure DATABASE_URL is set and the database is running.\n" +
        "Expected: postgresql://postgres:postgres@localhost:5432/webhook_monitor_test"
    );
    throw error;
  }
});

/**
 * Clean up database before each test to ensure isolation
 */
beforeEach(async () => {
  if (prisma) {
    await cleanDatabase();
  }
});

/**
 * Disconnect from database after all tests complete
 */
afterAll(async () => {
  if (prisma) {
    await cleanDatabase();
    await prisma.$disconnect();
  }
});
