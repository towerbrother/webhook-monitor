import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { buildApp } from "../../app.js";
import { createPrismaClient } from "@repo/db";
import { Queue } from "bullmq";
import type { WebhookDeliveryJobData } from "@repo/queue";

// Mock the queue
const mockQueue = {
  add: async () => ({ id: "mock-job-id" }),
} as unknown as Queue<WebhookDeliveryJobData>;

// Use a shared prisma client for setup/teardown
// NOTE: app.ts usually instantiates its own prisma client or takes one as arg.
// In buildApp implementation we see it takes prisma as an arg.
// We must ensure we use the SAME instance or at least same DB connection.
const prisma = createPrismaClient();

describe("Webhook Events List API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let request: ReturnType<typeof supertest>;

  const projectId = "proj_test_list_events";
  const endpointId = "ep_test_list_events";
  const projectKey = "pk_test_list_events";

  beforeAll(async () => {
    // Pass the prisma client to the app build
    app = await buildApp({
      prisma,
      queue: mockQueue,
    });
    await app.ready();
    request = supertest(app.server);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // Re-create data before each test because global setup cleans DB
  beforeEach(async () => {
    // Clean up existing test data (just in case)
    await prisma.event.deleteMany({
      where: { projectId },
    });
    await prisma.webhookEndpoint.deleteMany({
      where: { projectId },
    });
    await prisma.project.deleteMany({
      where: { id: projectId },
    });

    // Create project
    await prisma.project.create({
      data: {
        id: projectId,
        name: "Test Project",
        projectKey: projectKey,
      },
    });

    // Create endpoint
    await prisma.webhookEndpoint.create({
      data: {
        id: endpointId,
        projectId: projectId,
        url: "https://example.com/webhook",
        name: "Test Endpoint",
      },
    });

    // Create 3 events
    await prisma.event.createMany({
      data: [
        {
          id: "evt_1",
          endpointId,
          projectId,
          method: "POST",
          headers: {},
          body: {},
          receivedAt: new Date("2023-01-01T10:00:00Z"),
        },
        {
          id: "evt_2",
          endpointId,
          projectId,
          method: "POST",
          headers: {},
          body: {},
          receivedAt: new Date("2023-01-01T11:00:00Z"),
        },
        {
          id: "evt_3",
          endpointId,
          projectId,
          method: "POST",
          headers: {},
          body: {},
          receivedAt: new Date("2023-01-01T12:00:00Z"),
        },
      ],
    });
  });

  it("should list events for an endpoint", async () => {
    const response = await request
      .get(`/webhooks/${endpointId}/events`)
      .set("x-project-key", projectKey)
      .expect(200);

    expect(response.body.data).toHaveLength(3);
    expect(response.body.data[0]).toHaveProperty("id");
    expect(response.body.data[0]).toHaveProperty("status");
    expect(response.body.data[0]).toHaveProperty("receivedAt");
    // Should be ordered by receivedAt desc (newest first)
    expect(response.body.data[0].id).toBe("evt_3");
    expect(response.body.data[2].id).toBe("evt_1");
  });

  it("should return empty list for valid endpoint with no events", async () => {
    // Create another endpoint
    const emptyEndpointId = "ep_empty";

    // Ensure project exists before creating endpoint (it should be created in beforeAll)
    // The previous failure here might be due to race conditions or transaction isolation in tests?
    // Vitest runs tests in parallel by default? No, usually sequentially within a file.
    // But multiple test files run in parallel.
    // The error "Foreign key constraint violated" means projectId doesn't exist.
    // Maybe the cleanup in afterAll of ANOTHER test file deleted it?
    // Let's use unique IDs for this test file. (Already doing that: proj_test_list_events)

    await prisma.webhookEndpoint.create({
      data: {
        id: emptyEndpointId,
        projectId,
        url: "https://example.com/empty",
        name: "Empty Endpoint",
      },
    });

    const response = await request
      .get(`/webhooks/${emptyEndpointId}/events`)
      .set("x-project-key", projectKey)
      .expect(200);

    expect(response.body.data).toEqual([]);

    // Cleanup
    await prisma.webhookEndpoint.delete({
      where: { id: emptyEndpointId },
    });
  });

  it("should paginate results", async () => {
    // Limit 1
    const response1 = await request
      .get(`/webhooks/${endpointId}/events?limit=1`)
      .set("x-project-key", projectKey)
      .expect(200);

    expect(response1.body.data).toHaveLength(1);
    expect(response1.body.data[0].id).toBe("evt_3");
    expect(response1.body.pagination.hasNextPage).toBe(true);
    expect(response1.body.pagination.nextCursor).toBeDefined();

    // Next page
    const cursor = response1.body.pagination.nextCursor;

    const response2 = await request
      .get(`/webhooks/${endpointId}/events?limit=2&cursor=${cursor}`)
      .set("x-project-key", projectKey)
      .expect(200);

    // This should return evt_2 and evt_1 (skipping cursor evt_3)
    expect(response2.body.data).toHaveLength(2);
    expect(response2.body.data[0].id).toBe("evt_2");
    expect(response2.body.data[1].id).toBe("evt_1");
    expect(response2.body.pagination.hasNextPage).toBe(false);
  });

  it("should return 400 if limit exceeds 100", async () => {
    const response = await request
      .get(`/webhooks/${endpointId}/events?limit=101`)
      .set("x-project-key", projectKey)
      .expect(400);

    expect(response.body.message).toContain("Invalid pagination parameters");
  });

  it("should return 404 for cross-tenant endpoint", async () => {
    // Create another project
    const otherProjectId = "proj_other";
    const otherProjectKey = "pk_other";
    await prisma.project.create({
      data: {
        id: otherProjectId,
        name: "Other Project",
        projectKey: otherProjectKey,
      },
    });

    // Try to access the first project's endpoint using second project's key
    const response = await request
      .get(`/webhooks/${endpointId}/events`)
      .set("x-project-key", otherProjectKey)
      .expect(404);

    expect(response.body.message).toContain(
      "not found or does not belong to this project"
    );

    // Cleanup
    await prisma.project.delete({
      where: { id: otherProjectId },
    });
  });

  it("should return 404 for non-existent endpoint", async () => {
    await request
      .get(`/webhooks/non_existent_ep/events`)
      .set("x-project-key", projectKey)
      .expect(404);
  });
});
