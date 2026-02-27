/**
 * Integration tests for worker job processing
 * Requires Redis to be running
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createWebhookDeliveryQueue,
  type Queue,
  type WebhookDeliveryJobData,
  QUEUE_NAMES,
} from "@repo/queue";
import { createPrismaClient, PrismaClient, EventStatus } from "@repo/db";
import { Worker } from "bullmq";
import nock from "nock";
import { randomUUID } from "crypto";

// Mock environment variables BEFORE any imports that read them (if possible)
process.env.DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/webhook_monitor_test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";

import { logger } from "../logger.js";
import { processWebhookDelivery } from "../processor.js";

describe("Worker Integration", () => {
  let queue: Queue<WebhookDeliveryJobData>;
  let prisma: PrismaClient;
  let worker: Worker;

  beforeAll(async () => {
    // For Prisma Client 5+, passing datasources here works for override
    // or passing the connection string in env which we did above.
    // If that fails, we can try using the 'datasourceUrl' property if the client was generated with it exposed.
    // But standard way is via environment variable which we set.

    // Use the factory function from the package, which handles the connection string from env
    prisma = createPrismaClient();

    queue = createWebhookDeliveryQueue({
      redis: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
        maxRetriesPerRequest: null,
      },
    });
    await queue.waitUntilReady();
  });

  beforeEach(async () => {
    // Clean up nock interceptors
    nock.cleanAll();
    // Drain queue
    await queue.drain();
  });

  afterAll(async () => {
    if (queue) {
      await queue.obliterate({ force: true });
      await queue.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
    if (worker) {
      await worker.close();
    }
  });

  it("should process a job and update event status to DELIVERED on 200 OK", async () => {
    const projectId = `proj_${randomUUID()}`;
    const endpointId = `end_${randomUUID()}`;
    const eventId = `evt_${randomUUID()}`;
    const targetUrl = "https://example.com/webhook";

    // Create test data in DB
    await prisma.project.create({
      data: {
        id: projectId,
        name: "Test Project",
        projectKey: `key_${randomUUID()}`,
      },
    });

    await prisma.webhookEndpoint.create({
      data: {
        id: endpointId,
        projectId,
        name: "Test Endpoint",
        url: `https://example.com/webhook/${randomUUID()}`, // Make URL unique to avoid unique constraint violation
      },
    });

    await prisma.event.create({
      data: {
        id: eventId,
        projectId,
        endpointId,
        status: EventStatus.PENDING,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { test: "data" },
      },
    });

    // Mock the external webhook target
    // Note: nock matches the path, so even with unique URL we can match based on domain + path
    // But since we are randomizing the path in the DB, we need to match that specific path or use regex
    // const path = new URL(targetUrl).pathname;

    // We used a fixed targetUrl in the job data, so nock should match that.
    // The DB URL is just for the record. The job data has the actual URL to call.
    // Wait, the job data usually comes from the event/endpoint, but in this test we construct it manually.
    // The processor uses job.data.url.
    // So we can put whatever we want in the DB as long as it satisfies constraints.

    const scope = nock("https://example.com")
      .post("/webhook")
      .reply(200, { success: true });

    // Start the worker manually to control connection and processor
    if (!worker) {
      worker = new Worker<WebhookDeliveryJobData>(
        QUEUE_NAMES.WEBHOOK_DELIVERY,
        async (job) => {
          await processWebhookDelivery(job, { logger, prisma });
        },
        {
          connection: {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT ?? "6379"),
            maxRetriesPerRequest: null,
          },
        }
      );
    }

    // Enqueue job
    const jobData: WebhookDeliveryJobData = {
      eventId,
      projectId,
      endpointId,
      url: targetUrl,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { test: "data" },
      attempt: 1,
    };

    await queue.add("test-job", jobData);

    // Wait for job to complete
    await new Promise<void>((resolve) => {
      worker.on("completed", (job) => {
        if (job.data.eventId === eventId) resolve();
      });
    });

    // Verify Nock was hit
    expect(scope.isDone()).toBe(true);

    // Verify DB state
    const updatedEvent = await prisma.event.findUnique({
      where: { id: eventId },
      include: { deliveryAttempts: true },
    });

    expect(updatedEvent?.status).toBe(EventStatus.DELIVERED);
    expect(updatedEvent?.deliveryAttempts).toHaveLength(1);
    expect(updatedEvent?.deliveryAttempts[0]?.success).toBe(true);
    expect(updatedEvent?.deliveryAttempts[0]?.statusCode).toBe(200);
  });

  it("should update event status to RETRYING on 500 failure", async () => {
    const projectId = `proj_${randomUUID()}`;
    const endpointId = `end_${randomUUID()}`;
    const eventId = `evt_${randomUUID()}`;
    const targetUrl = "https://example.com/fail";

    // Create test data
    await prisma.project.create({
      data: {
        id: projectId,
        name: "Test Project 2",
        projectKey: `key_${randomUUID()}`,
      },
    });

    await prisma.webhookEndpoint.create({
      data: {
        id: endpointId,
        projectId,
        name: "Test Endpoint 2",
        url: `https://example.com/fail/${randomUUID()}`, // Make URL unique
      },
    });

    await prisma.event.create({
      data: {
        id: eventId,
        projectId,
        endpointId,
        status: EventStatus.PENDING,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { test: "fail" },
      },
    });

    // Mock 500 error
    const scope = nock("https://example.com")
      .post("/fail")
      .reply(500, { error: "Internal Server Error" });

    // Enqueue job
    const jobData: WebhookDeliveryJobData = {
      eventId,
      projectId,
      endpointId,
      url: targetUrl,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { test: "fail" },
      attempt: 1,
    };

    await queue.add("test-job-fail", jobData);

    await new Promise<void>((resolve) => {
      // The worker will fail the job because the processor throws on non-2xx
      // But we also catch "completed" if we changed logic to not throw.
      // Current processor logic throws on failure to trigger BullMQ retry.
      worker.on("failed", (job) => {
        if (job?.data.eventId === eventId) resolve();
      });
    });

    // Verify Nock was hit
    expect(scope.isDone()).toBe(true);

    // Verify DB state
    const updatedEvent = await prisma.event.findUnique({
      where: { id: eventId },
      include: { deliveryAttempts: true },
    });

    expect(updatedEvent?.status).toBe(EventStatus.RETRYING);
    expect(updatedEvent?.deliveryAttempts).toHaveLength(1);
    expect(updatedEvent?.deliveryAttempts[0]?.success).toBe(false);
    expect(updatedEvent?.deliveryAttempts[0]?.statusCode).toBe(500);
  });
});
