/**
 * Test helpers for @repo/db
 *
 * Factory functions for creating test data with sensible defaults.
 * These helpers ensure consistent test data across all test files.
 */

import {
  Prisma,
  type PrismaClient,
  type Project,
  type WebhookEndpoint,
  type Event,
} from "../generated/client.js";

/**
 * Generate a unique ID for test data
 * Uses timestamp + random suffix to avoid collisions
 */
export function uniqueId(prefix = "test"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique project key for testing
 */
export function uniqueProjectKey(): string {
  return `pk_test_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create a test project with sensible defaults
 */
export async function createTestProject(
  prisma: PrismaClient,
  overrides: Partial<Omit<Project, "id" | "createdAt">> = {}
): Promise<Project> {
  return prisma.project.create({
    data: {
      name: overrides.name ?? `Test Project ${uniqueId()}`,
      projectKey: overrides.projectKey ?? uniqueProjectKey(),
    },
  });
}

/**
 * Create a test webhook endpoint with sensible defaults
 */
export async function createTestEndpoint(
  prisma: PrismaClient,
  projectId: string,
  overrides: Partial<
    Omit<WebhookEndpoint, "id" | "createdAt" | "projectId">
  > = {}
): Promise<WebhookEndpoint> {
  return prisma.webhookEndpoint.create({
    data: {
      projectId,
      url: overrides.url ?? `https://example.com/webhook/${uniqueId()}`,
      name: overrides.name ?? `Test Endpoint ${uniqueId()}`,
    },
  });
}

/**
 * Create a test event with sensible defaults
 */
export async function createTestEvent(
  prisma: PrismaClient,
  projectId: string,
  endpointId: string,
  overrides: Partial<
    Omit<Event, "id" | "receivedAt" | "projectId" | "endpointId">
  > = {}
): Promise<Event> {
  // Determine body value, converting null to Prisma.JsonNull
  const bodyValue =
    "body" in overrides
      ? overrides.body === null
        ? Prisma.JsonNull
        : overrides.body
      : { test: true };

  return prisma.event.create({
    data: {
      projectId,
      endpointId,
      method: overrides.method ?? "POST",
      headers: overrides.headers ?? { "content-type": "application/json" },
      body: bodyValue,
      idempotencyKey:
        "idempotencyKey" in overrides ? overrides.idempotencyKey : null,
    },
  });
}

/**
 * Create a complete test scenario with project, endpoint, and event
 * Useful for tests that need a full data hierarchy
 */
export async function createTestScenario(prisma: PrismaClient): Promise<{
  project: Project;
  endpoint: WebhookEndpoint;
  event: Event;
}> {
  const project = await createTestProject(prisma);
  const endpoint = await createTestEndpoint(prisma, project.id);
  const event = await createTestEvent(prisma, project.id, endpoint.id);

  return { project, endpoint, event };
}

/**
 * Assert that a Prisma operation throws a unique constraint violation
 * Useful for testing idempotency key uniqueness
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002"
  );
}

/**
 * Assert that a Prisma operation throws a foreign key constraint violation
 * Useful for testing referential integrity
 */
export function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2003"
  );
}
