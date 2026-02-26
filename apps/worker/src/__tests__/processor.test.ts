/**
 * Unit tests for the webhook delivery job processor
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processWebhookDelivery,
  DeliveryError,
  type ProcessorContext,
} from "../processor.js";
import type { Job, WebhookDeliveryJobData } from "@repo/queue";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockJob(
  data: Partial<WebhookDeliveryJobData> = {},
  overrides: { attemptsMade?: number; attempts?: number } = {}
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
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: overrides.attempts ?? 5 },
  } as unknown as Job<WebhookDeliveryJobData>;
}

function createMockLogger(): ProcessorContext["logger"] {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

function createMockPrisma(eventStatus = "PENDING"): ProcessorContext["prisma"] {
  const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
    const tx = {
      event: {
        findUnique: vi.fn().mockResolvedValue({ status: eventStatus }),
        update: vi.fn().mockResolvedValue({}),
      },
      deliveryAttempt: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    await fn(tx);
  });

  return {
    $transaction: mockTransaction,
  } as unknown as ProcessorContext["prisma"];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("processWebhookDelivery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("successful delivery (2xx)", () => {
    it("should deliver and update event to DELIVERED on 200", async () => {
      const logger = createMockLogger();
      const prisma = createMockPrisma("PENDING");
      const job = createMockJob();

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" })
      );

      await processWebhookDelivery(job, { logger, prisma });

      // Should log start and success
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: "event-456", attempt: 1 }),
        "Processing webhook delivery job"
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: "event-456", statusCode: 200 }),
        "Webhook delivery successful"
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("should pass correct headers, method, and body to fetch", async () => {
      const logger = createMockLogger();
      const prisma = createMockPrisma("PENDING");
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });
      vi.stubGlobal("fetch", fetchMock);

      const job = createMockJob({
        url: "https://hooks.example.com/receive",
        method: "POST",
        headers: { "x-custom": "header-value" },
        body: { event: "push" },
      });

      await processWebhookDelivery(job, { logger, prisma });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://hooks.example.com/receive",
        expect.objectContaining({
          method: "POST",
          headers: { "x-custom": "header-value" },
          body: JSON.stringify({ event: "push" }),
        })
      );
    });

    it("should not throw on successful delivery", async () => {
      const logger = createMockLogger();
      const prisma = createMockPrisma("PENDING");
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue({ ok: true, status: 201, statusText: "Created" })
      );

      await expect(
        processWebhookDelivery(createMockJob(), { logger, prisma })
      ).resolves.toBeUndefined();
    });

    it("should write a DeliveryAttempt with success=true", async () => {
      const logger = createMockLogger();
      const mockTx = {
        event: {
          findUnique: vi.fn().mockResolvedValue({ status: "PENDING" }),
          update: vi.fn().mockResolvedValue({}),
        },
        deliveryAttempt: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<void>) =>
          fn(mockTx)
        ),
      } as unknown as ProcessorContext["prisma"];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" })
      );

      await processWebhookDelivery(createMockJob(), { logger, prisma });

      expect(mockTx.deliveryAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId: "event-456",
            projectId: "project-789",
            attemptNumber: 1,
            success: true,
            statusCode: 200,
          }),
        })
      );
      expect(mockTx.event.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "DELIVERED" } })
      );
    });
  });

  describe("failed delivery (non-2xx)", () => {
    it("should throw DeliveryError on 500 response", async () => {
      const logger = createMockLogger();
      const prisma = createMockPrisma("PENDING");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })
      );

      await expect(
        processWebhookDelivery(createMockJob(), { logger, prisma })
      ).rejects.toThrow(DeliveryError);
    });

    it("should set Event.status to RETRYING when not last attempt", async () => {
      const mockTx = {
        event: {
          findUnique: vi.fn().mockResolvedValue({ status: "PENDING" }),
          update: vi.fn().mockResolvedValue({}),
        },
        deliveryAttempt: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<void>) =>
          fn(mockTx)
        ),
      } as unknown as ProcessorContext["prisma"];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
        })
      );

      // attemptsMade=0 means attempt 1 of 5 → not last
      const job = createMockJob({}, { attemptsMade: 0, attempts: 5 });

      await expect(
        processWebhookDelivery(job, { logger: createMockLogger(), prisma })
      ).rejects.toThrow(DeliveryError);

      expect(mockTx.event.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "RETRYING" } })
      );
    });

    it("should set Event.status to FAILED on last attempt", async () => {
      const mockTx = {
        event: {
          findUnique: vi.fn().mockResolvedValue({ status: "RETRYING" }),
          update: vi.fn().mockResolvedValue({}),
        },
        deliveryAttempt: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<void>) =>
          fn(mockTx)
        ),
      } as unknown as ProcessorContext["prisma"];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })
      );

      // attemptsMade=4 means attempt 5 of 5 → last attempt
      const job = createMockJob({}, { attemptsMade: 4, attempts: 5 });

      await expect(
        processWebhookDelivery(job, { logger: createMockLogger(), prisma })
      ).rejects.toThrow(DeliveryError);

      expect(mockTx.event.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "FAILED" } })
      );
    });

    it("should record DeliveryAttempt with success=false on non-2xx", async () => {
      const mockTx = {
        event: {
          findUnique: vi.fn().mockResolvedValue({ status: "PENDING" }),
          update: vi.fn().mockResolvedValue({}),
        },
        deliveryAttempt: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<void>) =>
          fn(mockTx)
        ),
      } as unknown as ProcessorContext["prisma"];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: "Not Found",
        })
      );

      await expect(
        processWebhookDelivery(createMockJob(), {
          logger: createMockLogger(),
          prisma,
        })
      ).rejects.toThrow(DeliveryError);

      expect(mockTx.deliveryAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ success: false, statusCode: 404 }),
        })
      );
    });
  });

  describe("network / timeout failures", () => {
    it("should throw DeliveryError when fetch throws (network error)", async () => {
      const logger = createMockLogger();
      const prisma = createMockPrisma("PENDING");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
      );

      await expect(
        processWebhookDelivery(createMockJob(), { logger, prisma })
      ).rejects.toThrow(DeliveryError);
    });

    it("should record errorMessage when fetch throws", async () => {
      const mockTx = {
        event: {
          findUnique: vi.fn().mockResolvedValue({ status: "PENDING" }),
          update: vi.fn().mockResolvedValue({}),
        },
        deliveryAttempt: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<void>) =>
          fn(mockTx)
        ),
      } as unknown as ProcessorContext["prisma"];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network timeout"))
      );

      await expect(
        processWebhookDelivery(createMockJob(), {
          logger: createMockLogger(),
          prisma,
        })
      ).rejects.toThrow(DeliveryError);

      expect(mockTx.deliveryAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            success: false,
            errorMessage: "network timeout",
          }),
        })
      );
    });
  });

  describe("already-delivered guard", () => {
    it("should not update status if event is already DELIVERED", async () => {
      const mockTx = {
        event: {
          findUnique: vi.fn().mockResolvedValue({ status: "DELIVERED" }),
          update: vi.fn(),
        },
        deliveryAttempt: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<void>) =>
          fn(mockTx)
        ),
      } as unknown as ProcessorContext["prisma"];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" })
      );

      await processWebhookDelivery(createMockJob(), {
        logger: createMockLogger(),
        prisma,
      });

      // Status update must be skipped
      expect(mockTx.event.update).not.toHaveBeenCalled();
    });
  });
});
