/**
 * Test setup for @repo/api
 *
 * Provides database connection lifecycle and cleanup hooks.
 * Reuses helpers from @repo/db for test data creation.
 */

import { beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@repo/db";

/**
 * Connect to database before all tests
 */
beforeAll(async () => {
  await prisma.$connect();
});

/**
 * Clean up test data before each test for isolation
 */
beforeEach(async () => {
  // Delete in dependency order (most dependent first)
  await prisma.event.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.project.deleteMany();
});

/**
 * Disconnect from database after all tests
 */
afterAll(async () => {
  await prisma.$disconnect();
});
