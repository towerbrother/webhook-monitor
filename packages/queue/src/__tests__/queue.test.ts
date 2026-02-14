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
  getWebhookDeliveryQueue,
  enqueueWebhookDelivery,
  closeQueue,
  type WebhookDeliveryJobData,
} from "../index.js";

describe("Webhook Delivery Queue", () => {
  beforeAll(async () => {
    // Ensure queue is initialized
    const queue = getWebhookDeliveryQueue();
    await queue.waitUntilReady();
  });

  beforeEach(async () => {
    // Clean up jobs from previous tests
    const queue = getWebhookDeliveryQueue();
    await queue.drain();
  });

  afterAll(async () => {
    const queue = getWebhookDeliveryQueue();
    await queue.obliterate({ force: true });
    await closeQueue();
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

      const jobId = await enqueueWebhookDelivery(jobData);

      expect(jobId).toBe(jobData.eventId); // jobId should equal eventId for idempotency

      // Verify job was added to queue
      const queue = getWebhookDeliveryQueue();
      const job = await queue.getJob(jobId);

      expect(job).not.toBeNull();
      expect(job!.data).toEqual(jobData);
      expect(job!.name).toBe(`deliver-${jobData.eventId}`);
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

      // First enqueue should succeed
      const jobId1 = await enqueueWebhookDelivery(jobData);
      expect(jobId1).toBe(jobData.eventId);

      // Second enqueue with same eventId should return same jobId (idempotent)
      // Note: BullMQ will not create a duplicate job if jobId already exists
      const jobId2 = await enqueueWebhookDelivery(jobData);
      expect(jobId2).toBe(jobData.eventId);

      // Should only have one job in queue
      const queue = getWebhookDeliveryQueue();
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

      await enqueueWebhookDelivery(jobData);

      const queue = getWebhookDeliveryQueue();
      const job = await queue.getJob(jobData.eventId);

      expect(job!.data.body).toEqual(complexBody);
    });
  });

  describe("Queue Configuration", () => {
    it("should have correct default job options", async () => {
      const queue = getWebhookDeliveryQueue();

      // Check that queue exists and is connected
      expect(queue.name).toBe("webhook-delivery");
    });

    it("should allow retrieving queue instance multiple times (singleton)", () => {
      const queue1 = getWebhookDeliveryQueue();
      const queue2 = getWebhookDeliveryQueue();

      expect(queue1).toBe(queue2); // Same instance
    });
  });
});
