/**
 * Integration tests for worker job processing
 * Requires Redis to be running
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
