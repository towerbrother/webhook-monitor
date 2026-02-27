import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import supertest from "supertest";
import { buildApp } from "../../app.js";
import { createPrismaClient } from "@repo/db";
import { Queue } from "bullmq";
import type { WebhookDeliveryJobData } from "@repo/queue";

// Mock the queue
const mockQueue = {
  add: vi.fn().mockResolvedValue({ id: "mock-job-id" }),
} as unknown as Queue<WebhookDeliveryJobData>;

const prisma = createPrismaClient();

describe("Webhook Replay API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let request: ReturnType<typeof supertest>;

  const projectId = "proj_test_replay";
  const projectKey = "pk_test_replay";
  const endpointId = "ep_test_replay";

  beforeAll(async () => {
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

  beforeEach(async () => {
    vi.clearAllMocks();

    // Clean up
    await prisma.event.deleteMany({ where: { projectId } });
    await prisma.webhookEndpoint.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });

    // Setup basic data
    await prisma.project.create({
      data: {
        id: projectId,
        name: "Replay Test Project",
        projectKey,
      },
    });

    await prisma.webhookEndpoint.create({
      data: {
        id: endpointId,
        projectId,
        url: "https://example.com/webhook",
        name: "Replay Endpoint",
      },
    });
  });

  it("should replay a FAILED event", async () => {
    const eventId = "evt_failed";
    await prisma.event.create({
      data: {
        id: eventId,
        endpointId,
        projectId,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { data: "test" },
        status: "FAILED",
      },
    });

    const response = await request
      .post(`/webhooks/${endpointId}/events/${eventId}/replay`)
      .set("x-project-key", projectKey)
      .expect(202);

    expect(response.body.success).toBe(true);
    expect(response.body.eventId).toBe(eventId);

    // Verify event status updated
    const updatedEvent = await prisma.event.findUnique({
      where: { id: eventId },
    });
    expect(updatedEvent?.status).toBe("PENDING");

    // Verify job enqueued
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArgs = (mockQueue.add as any).mock.calls[0];
    expect(callArgs[1].eventId).toBe(eventId);
    expect(callArgs[1].attempt).toBe(1);
  });

  it("should skip replay if event is not FAILED", async () => {
    const eventId = "evt_delivered";
    await prisma.event.create({
      data: {
        id: eventId,
        endpointId,
        projectId,
        method: "POST",
        headers: {},
        body: {},
        status: "DELIVERED",
      },
    });

    const response = await request
      .post(`/webhooks/${endpointId}/events/${eventId}/replay`)
      .set("x-project-key", projectKey)
      .expect(200);

    expect(response.body.message).toContain("skipping replay");

    // Ensure queue was NOT called
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it("should return 404 for non-existent event", async () => {
    await request
      .post(`/webhooks/${endpointId}/events/evt_non_existent/replay`)
      .set("x-project-key", projectKey)
      .expect(404);
  });

  it("should return 404 for cross-tenant access", async () => {
    const otherProjectId = "proj_other";
    const otherProjectKey = "pk_other";

    await prisma.project.create({
      data: { id: otherProjectId, name: "Other", projectKey: otherProjectKey },
    });

    // Valid event for first project
    const eventId = "evt_cross_tenant";
    await prisma.event.create({
      data: {
        id: eventId,
        endpointId,
        projectId,
        method: "POST",
        headers: {},
        body: {},
        status: "FAILED",
      },
    });

    // Try to replay with other project's key
    await request
      .post(`/webhooks/${endpointId}/events/${eventId}/replay`)
      .set("x-project-key", otherProjectKey)
      .expect(404);

    // Cleanup
    await prisma.project.delete({ where: { id: otherProjectId } });
  });

  it("should rate limit replays", async () => {
    // Use a unique project ID for this test to avoid interference from previous tests
    // (since the rate limiter map is in-memory and global)
    const rateLimitProjectId = "proj_rate_limit";
    const rateLimitProjectKey = "pk_rate_limit";
    const rateLimitEndpointId = "ep_rate_limit";

    // Setup separate project for rate limiting test
    await prisma.project.create({
      data: {
        id: rateLimitProjectId,
        name: "Rate Limit Project",
        projectKey: rateLimitProjectKey,
      },
    });

    await prisma.webhookEndpoint.create({
      data: {
        id: rateLimitEndpointId,
        projectId: rateLimitProjectId,
        url: "https://example.com/webhook-rate-limit", // Unique URL to avoid constraint violation
        name: "Rate Limit Endpoint",
      },
    });

    // Setup a failed event
    const eventId = "evt_rate_limit";
    await prisma.event.create({
      data: {
        id: eventId,
        endpointId: rateLimitEndpointId,
        projectId: rateLimitProjectId,
        method: "POST",
        headers: {},
        body: {},
        status: "FAILED",
      },
    });

    // Fire 10 requests (allowed)
    for (let i = 0; i < 10; i++) {
      await request
        .post(`/webhooks/${rateLimitEndpointId}/events/${eventId}/replay`)
        .set("x-project-key", rateLimitProjectKey)
        .expect(202);

      // Reset status back to FAILED so we can replay again
      await prisma.event.update({
        where: { id: eventId },
        data: { status: "FAILED" },
      });
    }

    // 11th request should fail
    await request
      .post(`/webhooks/${rateLimitEndpointId}/events/${eventId}/replay`)
      .set("x-project-key", rateLimitProjectKey)
      .expect(429);

    // Cleanup
    await prisma.event.deleteMany({ where: { projectId: rateLimitProjectId } });
    await prisma.webhookEndpoint.deleteMany({
      where: { projectId: rateLimitProjectId },
    });
    await prisma.project.delete({ where: { id: rateLimitProjectId } });
  });
});
