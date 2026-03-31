/**
 * Integration tests for worker job processing
 * Requires Redis and PostgreSQL to be running
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createWebhookDeliveryQueue,
  enqueueWebhookDelivery,
  Worker,
  QUEUE_NAMES,
  type Queue,
  type WebhookDeliveryJobData,
} from "@repo/queue";
import { createPrismaClient, EventStatus, type PrismaClient } from "@repo/db";
import { processWebhookDelivery } from "../processor.js";
import { createLogger } from "../logger.js";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

describe("Worker Integration", () => {
  let queue: Queue<WebhookDeliveryJobData>;

  beforeAll(async () => {
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
    await queue.drain();
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it("should process a job from the queue", async () => {
    const processedJobs: string[] = [];

    // Create worker
    const worker = new Worker<WebhookDeliveryJobData>(
      QUEUE_NAMES.WEBHOOK_DELIVERY,
      async (job) => {
        processedJobs.push(job.data.eventId);
      },
      {
        connection: {
          host: process.env.REDIS_HOST ?? "localhost",
          port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
          maxRetriesPerRequest: null,
        },
      }
    );

    // Enqueue a job
    const jobData: WebhookDeliveryJobData = {
      eventId: "integration-test-event",
      projectId: "test-project",
      endpointId: "test-endpoint",
      url: "https://example.com/webhook",
      method: "POST",
      headers: {},
      body: null,
      attempt: 1,
      correlationId: "test-correlation-integration",
    };

    await enqueueWebhookDelivery(queue, jobData);

    // Wait for job to be processed
    await new Promise<void>((resolve) => {
      worker.on("completed", () => {
        resolve();
      });
    });

    // Verify job was processed
    expect(processedJobs).toContain("integration-test-event");

    await worker.close();
  });

  it("should handle multiple jobs in order", async () => {
    const processedOrder: string[] = [];

    const worker = new Worker<WebhookDeliveryJobData>(
      QUEUE_NAMES.WEBHOOK_DELIVERY,
      async (job) => {
        processedOrder.push(job.data.eventId);
      },
      {
        connection: {
          host: process.env.REDIS_HOST ?? "localhost",
          port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
          maxRetriesPerRequest: null,
        },
        concurrency: 1, // Process one at a time for order guarantee
      }
    );

    // Enqueue multiple jobs
    for (let i = 1; i <= 3; i++) {
      await enqueueWebhookDelivery(queue, {
        eventId: `event-${i}`,
        projectId: "test-project",
        endpointId: "test-endpoint",
        url: "https://example.com/webhook",
        method: "POST",
        headers: {},
        body: null,
        attempt: 1,
        correlationId: `test-correlation-${i}`,
      });
    }

    // Wait for all jobs
    await new Promise<void>((resolve) => {
      let completed = 0;
      worker.on("completed", () => {
        completed++;
        if (completed === 3) resolve();
      });
    });

    expect(processedOrder).toEqual(["event-1", "event-2", "event-3"]);

    await worker.close();
  });

  it("should handle worker restart without losing jobs", async () => {
    // Enqueue a job with no worker running
    await enqueueWebhookDelivery(queue, {
      eventId: "persisted-event",
      projectId: "test-project",
      endpointId: "test-endpoint",
      url: "https://example.com/webhook",
      method: "POST",
      headers: {},
      body: null,
      attempt: 1,
      correlationId: "test-correlation-persisted",
    });

    // Verify job is waiting
    const waitingCount = await queue.getWaitingCount();
    expect(waitingCount).toBe(1);

    // Start worker
    const processedJobs: string[] = [];
    const worker = new Worker<WebhookDeliveryJobData>(
      QUEUE_NAMES.WEBHOOK_DELIVERY,
      async (job) => {
        processedJobs.push(job.data.eventId);
      },
      {
        connection: {
          host: process.env.REDIS_HOST ?? "localhost",
          port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
          maxRetriesPerRequest: null,
        },
      }
    );

    // Wait for job to be processed
    await new Promise<void>((resolve) => {
      worker.on("completed", () => resolve());
    });

    expect(processedJobs).toContain("persisted-event");

    await worker.close();
  });

  it("should process jobs with complex data", async () => {
    const processedData: WebhookDeliveryJobData[] = [];

    const worker = new Worker<WebhookDeliveryJobData>(
      QUEUE_NAMES.WEBHOOK_DELIVERY,
      async (job) => {
        processedData.push(job.data);
      },
      {
        connection: {
          host: process.env.REDIS_HOST ?? "localhost",
          port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
          maxRetriesPerRequest: null,
        },
      }
    );

    const complexJobData: WebhookDeliveryJobData = {
      eventId: "complex-event",
      projectId: "project-xyz",
      endpointId: "endpoint-123",
      url: "https://api.example.com/webhooks/receive",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature": "abc123",
      },
      body: {
        nested: {
          deeply: {
            value: [1, 2, 3],
          },
        },
        array: [{ a: 1 }, { b: 2 }],
      },
      attempt: 2,
      correlationId: "test-correlation-complex",
    };

    await enqueueWebhookDelivery(queue, complexJobData);

    // Wait for job to be processed
    await new Promise<void>((resolve) => {
      worker.on("completed", () => resolve());
    });

    expect(processedData).toHaveLength(1);
    expect(processedData[0]).toEqual(complexJobData);

    await worker.close();
  });
});

describe("Worker Integration with Database", () => {
  let queue: Queue<WebhookDeliveryJobData>;
  let prisma: PrismaClient;
  let mockServer: Server;
  let mockServerUrl: string;

  beforeAll(async () => {
    // Initialize queue
    queue = createWebhookDeliveryQueue({
      redis: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
        maxRetriesPerRequest: null,
      },
    });
    await queue.waitUntilReady();

    // Initialize Prisma
    prisma = createPrismaClient({ silent: true });
    await prisma.$connect();
  });

  beforeEach(async () => {
    await queue.drain();
    // Clean database for test isolation
    await prisma.deliveryAttempt.deleteMany({});
    await prisma.event.deleteMany({});
    await prisma.webhookEndpoint.deleteMany({});
    await prisma.project.deleteMany({});
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await prisma.$disconnect();
  });

  it("should create DeliveryAttempt on successful delivery", async () => {
    // Create mock server returning 200
    let requestReceived = false;
    mockServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      requestReceived = true;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => resolve());
    });

    const address = mockServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to get mock server address");
    }
    mockServerUrl = `http://127.0.0.1:${address.port}`;

    // Create test data in database
    const project = await prisma.project.create({
      data: {
        name: "Test Project",
        projectKey: "test-key-success",
      },
    });

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        name: "Test Endpoint",
        url: "/webhook/test-success",
        projectId: project.id,
      },
    });

    const event = await prisma.event.create({
      data: {
        projectId: project.id,
        endpointId: endpoint.id,
        method: "POST",
        headers: {},
        body: { test: "data" },
        status: EventStatus.PENDING,
      },
    });

    // Create worker with real processor
    const logger = createLogger({
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      REDIS_HOST: process.env.REDIS_HOST ?? "localhost",
      REDIS_PORT: parseInt(process.env.REDIS_PORT ?? "6379", 10),
      NODE_ENV: "test",
      LOG_LEVEL: "fatal",
    });
    const worker = new Worker<WebhookDeliveryJobData>(
      QUEUE_NAMES.WEBHOOK_DELIVERY,
      async (job) => {
        await processWebhookDelivery(job, { logger, prisma });
      },
      {
        connection: {
          host: process.env.REDIS_HOST ?? "localhost",
          port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
          maxRetriesPerRequest: null,
        },
      }
    );

    // Enqueue job pointing to mock server
    await enqueueWebhookDelivery(queue, {
      eventId: event.id,
      projectId: project.id,
      endpointId: endpoint.id,
      url: mockServerUrl,
      method: "POST",
      headers: {},
      body: { test: "data" },
      attempt: 1,
      correlationId: "test-correlation-success",
    });

    // Wait for job completion
    await new Promise<void>((resolve) => {
      worker.on("completed", () => resolve());
    });

    // Verify mock server received request
    expect(requestReceived).toBe(true);

    // Query DeliveryAttempt via Prisma
    const deliveryAttempts = await prisma.deliveryAttempt.findMany({
      where: { eventId: event.id },
    });

    expect(deliveryAttempts).toHaveLength(1);
    expect(deliveryAttempts[0]?.success).toBe(true);
    expect(deliveryAttempts[0]?.statusCode).toBe(200);
    expect(deliveryAttempts[0]?.attemptNumber).toBe(1);
    expect(deliveryAttempts[0]?.projectId).toBe(project.id);

    // Query Event to verify status
    const updatedEvent = await prisma.event.findUnique({
      where: { id: event.id },
    });

    expect(updatedEvent?.status).toBe(EventStatus.DELIVERED);

    // Cleanup
    await worker.close();
    mockServer.close();
  });

  it("should create DeliveryAttempt on failed delivery", async () => {
    // Create mock server returning 500
    mockServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => resolve());
    });

    const address = mockServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to get mock server address");
    }
    mockServerUrl = `http://127.0.0.1:${address.port}`;

    // Create test data in database
    const project = await prisma.project.create({
      data: {
        name: "Test Project Failure",
        projectKey: "test-key-failure",
      },
    });

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        name: "Test Endpoint Failure",
        url: "/webhook/test-failure",
        projectId: project.id,
      },
    });

    const event = await prisma.event.create({
      data: {
        projectId: project.id,
        endpointId: endpoint.id,
        method: "POST",
        headers: {},
        body: { test: "data" },
        status: EventStatus.PENDING,
      },
    });

    // Create worker with real processor
    const logger = createLogger({
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      REDIS_HOST: process.env.REDIS_HOST ?? "localhost",
      REDIS_PORT: parseInt(process.env.REDIS_PORT ?? "6379", 10),
      NODE_ENV: "test",
      LOG_LEVEL: "fatal",
    });
    const worker = new Worker<WebhookDeliveryJobData>(
      QUEUE_NAMES.WEBHOOK_DELIVERY,
      async (job) => {
        await processWebhookDelivery(job, { logger, prisma });
      },
      {
        connection: {
          host: process.env.REDIS_HOST ?? "localhost",
          port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
          maxRetriesPerRequest: null,
        },
      }
    );

    // Enqueue job pointing to mock server
    await enqueueWebhookDelivery(queue, {
      eventId: event.id,
      projectId: project.id,
      endpointId: endpoint.id,
      url: mockServerUrl,
      method: "POST",
      headers: {},
      body: { test: "data" },
      attempt: 1,
      correlationId: "test-correlation-failure",
    });

    // Wait for job to fail
    await new Promise<void>((resolve) => {
      worker.on("failed", () => resolve());
    });

    // Query DeliveryAttempt via Prisma
    const deliveryAttempts = await prisma.deliveryAttempt.findMany({
      where: { eventId: event.id },
    });

    expect(deliveryAttempts).toHaveLength(1);
    expect(deliveryAttempts[0]?.success).toBe(false);
    expect(deliveryAttempts[0]?.statusCode).toBe(500);
    expect(deliveryAttempts[0]?.attemptNumber).toBe(1);
    expect(deliveryAttempts[0]?.errorMessage).toContain("HTTP 500");
    expect(deliveryAttempts[0]?.projectId).toBe(project.id);

    // Query Event to verify status
    const updatedEvent = await prisma.event.findUnique({
      where: { id: event.id },
    });

    expect(updatedEvent?.status).toBe(EventStatus.RETRYING);

    // Cleanup
    await worker.close();
    mockServer.close();
  });
});
