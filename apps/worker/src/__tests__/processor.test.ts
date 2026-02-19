/**
 * Unit tests for the webhook delivery job processor
 */

import { describe, it, expect, vi } from "vitest";
import { processWebhookDelivery, type ProcessorContext } from "../processor.js";
import type { Job, WebhookDeliveryJobData } from "@repo/queue";

// Create a mock job
function createMockJob(
  data: Partial<WebhookDeliveryJobData> = {}
): Job<WebhookDeliveryJobData> {
  return {
    id: "job-123",
    data: {
      eventId: "event-456",
      projectId: "project-789",
      endpointId: "endpoint-abc",
      url: "https://example.com/webhook",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { test: true },
      attempt: 1,
      ...data,
    },
    attemptsMade: 0,
  } as Job<WebhookDeliveryJobData>;
}

// Create a mock logger
function createMockLogger(): ProcessorContext["logger"] {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

describe("processWebhookDelivery", () => {
  it("should log job processing start and completion", async () => {
    const logger = createMockLogger();
    const job = createMockJob();

    await processWebhookDelivery(job, { logger });

    // Verify logging calls
    expect(logger.info).toHaveBeenCalledTimes(2);

    // First call: processing start
    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventId: "event-456",
        projectId: "project-789",
        endpointId: "endpoint-abc",
      }),
      "Processing webhook delivery job"
    );

    // Second call: completion
    expect(logger.info).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventId: "event-456",
        projectId: "project-789",
      }),
      "Webhook delivery job completed (placeholder)"
    );
  });

  it("should handle jobs with different data", async () => {
    const logger = createMockLogger();
    const job = createMockJob({
      eventId: "custom-event",
      projectId: "custom-project",
      url: "https://other.example.com/hook",
    });

    await processWebhookDelivery(job, { logger });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "custom-event",
        projectId: "custom-project",
        url: "https://other.example.com/hook",
      }),
      expect.any(String)
    );
  });

  it("should not throw errors", async () => {
    const logger = createMockLogger();
    const job = createMockJob();

    // Should complete without throwing
    await expect(
      processWebhookDelivery(job, { logger })
    ).resolves.toBeUndefined();
  });

  it("should include jobId in logs", async () => {
    const logger = createMockLogger();
    const job = createMockJob();

    await processWebhookDelivery(job, { logger });

    // Verify jobId is included in logging
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-123",
      }),
      expect.any(String)
    );
  });

  it("should include attempt number in logs", async () => {
    const logger = createMockLogger();
    const job = createMockJob({ attempt: 3 });

    await processWebhookDelivery(job, { logger });

    // Verify attempt is included in first log call
    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        attempt: 3,
      }),
      expect.any(String)
    );
  });
});
