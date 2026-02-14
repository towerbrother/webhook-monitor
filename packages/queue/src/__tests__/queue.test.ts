/**
 * Queue Integration Tests
 *
 * Tests for the webhook delivery queue:
 * - Job enqueuing
 * - Job data structure
 * - Idempotency via jobId
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createWebhookDeliveryQueue,
  enqueueWebhookDelivery,
  type WebhookDeliveryJobData,
  type Queue,
} from "../index.js";

describe("Webhook Delivery Queue", () => {
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

  describe("enqueueWebhookDelivery", () => {
    it("should enqueue a job with correct data", async () => {
      const jobData: WebhookDeliveryJobData = {
        eventId: "test-event-123",
        projectId: "test-project-456",
        endpointId: "test-endpoint-789",
        url: "https://example.com/webhook",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { test: true },
        attempt: 1,
      };

      const jobId = await enqueueWebhookDelivery(queue, jobData);

      expect(jobId).toBe(jobData.eventId);

      const job = await queue.getJob(jobId);
      expect(job).not.toBeNull();
      expect(job!.data).toEqual(jobData);
    });

    it("should use eventId as jobId for idempotency", async () => {
      const jobData: WebhookDeliveryJobData = {
        eventId: "idempotent-event-001",
        projectId: "project-1",
        endpointId: "endpoint-1",
        url: "https://example.com/webhook",
        method: "POST",
        headers: {},
        body: null,
        attempt: 1,
      };

      const jobId1 = await enqueueWebhookDelivery(queue, jobData);
      const jobId2 = await enqueueWebhookDelivery(queue, jobData);

      expect(jobId1).toBe(jobData.eventId);
      expect(jobId2).toBe(jobData.eventId);

      const waitingCount = await queue.getWaitingCount();
      expect(waitingCount).toBe(1);
    });

    it("should preserve complex body data", async () => {
      const complexBody = {
        nested: {
          deeply: {
            value: [1, 2, 3],
          },
        },
        array: [{ a: 1 }, { b: 2 }],
        nullValue: null,
        stringValue: "test",
      };

      const jobData: WebhookDeliveryJobData = {
        eventId: "complex-body-event",
        projectId: "project-1",
        endpointId: "endpoint-1",
        url: "https://example.com/webhook",
        method: "POST",
        headers: {},
        body: complexBody,
        attempt: 1,
      };

      await enqueueWebhookDelivery(queue, jobData);

      const job = await queue.getJob(jobData.eventId);

      expect(job!.data.body).toEqual(complexBody);
    });
  });

  describe("createWebhookDeliveryQueue", () => {
    it("should create independent queue instances", async () => {
      const queue1 = createWebhookDeliveryQueue({
        redis: { host: "localhost", port: 6379, maxRetriesPerRequest: null },
      });
      const queue2 = createWebhookDeliveryQueue({
        redis: { host: "localhost", port: 6379, maxRetriesPerRequest: null },
      });

      expect(queue1).not.toBe(queue2);

      await queue1.close();
      await queue2.close();
    });
  });
});
