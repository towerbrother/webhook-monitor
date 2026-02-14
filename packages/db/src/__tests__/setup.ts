/**
 * Test setup for @repo/db
 *
 * This file runs before each test file and handles:
 * - Database connection verification
 * - Test isolation (cleanup between tests)
 */

import { beforeAll, afterAll, afterEach } from "vitest";
import { prisma } from "../index.js";

/**
 * Verify database connection before running any tests
 */
beforeAll(async () => {
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
 * Clean up database after each test to ensure isolation
 * Deletes in correct order to respect foreign key constraints
 */
afterEach(async () => {
  // Delete in reverse dependency order
  await prisma.event.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.project.deleteMany();
});

/**
 * Disconnect from database after all tests complete
 */
afterAll(async () => {
  await prisma.$disconnect();
});
