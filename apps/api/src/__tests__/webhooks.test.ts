/**
 * Webhook API Tests
 *
 * Tests for the webhook ingestion API endpoints:
 * - POST /webhooks/:endpointId - Receive webhook for specific endpoint
 * - POST /webhooks - Project-wide webhook (placeholder)
 *
 * Validates:
 * - Authentication via X-Project-Key header
 * - Endpoint ownership (tenant isolation)
 * - Event creation and persistence
 * - Idempotency key handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { getTestPrisma } from "./setup.js";
import {
  createWebhookDeliveryQueue,
  type Queue,
  type WebhookDeliveryJobData,
} from "@repo/queue";
import { createTestProject, createTestEndpoint } from "@repo/db/testing";

let app: FastifyInstance;
let queue: Queue<WebhookDeliveryJobData>;

beforeAll(async () => {
  const prisma = getTestPrisma();

  queue = createWebhookDeliveryQueue({
    redis: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
      db: parseInt(process.env.REDIS_DB ?? "0", 10),
      maxRetriesPerRequest: null,
    },
  });
  await queue.waitUntilReady();
  await queue.obliterate({ force: true });

  app = await buildApp({ prisma, queue, logger: false });
});

beforeEach(async () => {
  await queue.obliterate({ force: true });
});

afterAll(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
  await app.close();
});

// Skip tests if DATABASE_URL is not set
const skipTests = !process.env.DATABASE_URL;

describe.skipIf(skipTests)("Webhook Ingestion API", () => {
  describe("Authentication", () => {
    it("should reject requests without X-Project-Key header", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/some-endpoint-id",
        payload: { test: true },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Missing X-Project-Key header");
    });

    it("should reject requests with invalid project key", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/some-endpoint-id",
        headers: {
          "x-project-key": "invalid_key_12345",
        },
        payload: { test: true },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Forbidden");
      expect(body.message).toBe("Invalid project key");
    });

    it("should accept requests with valid project key", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const response = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project.projectKey,
        },
        payload: { test: true },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.eventId).toBeDefined();
    });
  });

  describe("Endpoint Ownership (Tenant Isolation)", () => {
    it("should reject access to endpoint belonging to another project", async () => {
      const prisma = getTestPrisma();
      // Create two projects
      const project1 = await createTestProject(prisma);
      const project2 = await createTestProject(prisma);

      // Create endpoint for project1
      const endpoint = await createTestEndpoint(prisma, project1.id);

      // Try to access project1's endpoint using project2's key
      const response = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project2.projectKey,
        },
        payload: { test: true },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
      expect(body.message).toBe(
        "Webhook endpoint not found or does not belong to this project"
      );
    });

    it("should allow access to own endpoint", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const response = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project.projectKey,
        },
        payload: { test: true },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it("should return 404 for non-existent endpoint", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);

      const response = await app.inject({
        method: "POST",
        url: "/webhooks/non-existent-endpoint-id",
        headers: {
          "x-project-key": project.projectKey,
        },
        payload: { test: true },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("Event Persistence", () => {
    it("should create event record in database", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const payload = { webhook: "data", nested: { value: 123 } };

      const response = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project.projectKey,
          "content-type": "application/json",
        },
        payload,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);

      // Verify event was persisted
      const event = await prisma.event.findUnique({
        where: { id: body.eventId },
      });

      expect(event).not.toBeNull();
      expect(event!.projectId).toBe(project.id);
      expect(event!.endpointId).toBe(endpoint.id);
      expect(event!.method).toBe("POST");
      expect(event!.body).toEqual(payload);
    });

    it("should store request headers", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const response = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project.projectKey,
          "content-type": "application/json",
          "x-custom-header": "custom-value",
        },
        payload: { test: true },
      });

      const body = JSON.parse(response.body);
      const event = await prisma.event.findUnique({
        where: { id: body.eventId },
      });

      expect(event!.headers).toHaveProperty("x-custom-header", "custom-value");
    });

    it("should handle empty body", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const response = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project.projectKey,
        },
        // No payload
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe("Response Format", () => {
    it("should return eventId and receivedAt timestamp", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const response = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project.projectKey,
        },
        payload: { test: true },
      });

      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.eventId).toBeDefined();
      expect(typeof body.eventId).toBe("string");
      expect(body.receivedAt).toBeDefined();
      // Verify receivedAt is a valid ISO date
      expect(() => new Date(body.receivedAt)).not.toThrow();
    });
  });

  describe("Project-wide Webhook", () => {
    it("should accept webhook at /webhooks endpoint", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);

      const response = await app.inject({
        method: "POST",
        url: "/webhooks",
        headers: {
          "x-project-key": project.projectKey,
        },
        payload: { test: true },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.projectId).toBe(project.id);
    });
  });

  describe("Idempotency", () => {
    it("should create event with idempotency key when header is provided", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const response = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project.projectKey,
          "x-idempotency-key": "test-key-123",
        },
        payload: { test: true },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);

      // Verify event has idempotency key
      const event = await prisma.event.findUnique({
        where: { id: body.eventId },
      });

      expect(event!.idempotencyKey).toBe("test-key-123");
    });

    it("should return 409 with original event when duplicate idempotency key is used", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      // First request
      const response1 = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project.projectKey,
          "x-idempotency-key": "duplicate-test-key",
        },
        payload: { test: true },
      });

      expect(response1.statusCode).toBe(201);
      const body1 = JSON.parse(response1.body);

      // Second request with same idempotency key
      const response2 = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project.projectKey,
          "x-idempotency-key": "duplicate-test-key",
        },
        payload: { different: "payload" },
      });

      expect(response2.statusCode).toBe(409);
      const body2 = JSON.parse(response2.body);

      // Should return the original event
      expect(body2.success).toBe(true);
      expect(body2.eventId).toBe(body1.eventId);
      expect(body2.receivedAt).toBe(body1.receivedAt);
      expect(body2.duplicate).toBe(true);

      // Verify only one event was created
      const events = await prisma.event.findMany({
        where: {
          projectId: project.id,
          idempotencyKey: "duplicate-test-key",
        },
      });
      expect(events.length).toBe(1);
    });

    it("should allow same idempotency key across different projects", async () => {
      const prisma = getTestPrisma();
      const project1 = await createTestProject(prisma);
      const project2 = await createTestProject(prisma);
      const endpoint1 = await createTestEndpoint(prisma, project1.id);
      const endpoint2 = await createTestEndpoint(prisma, project2.id);

      // Request for project 1
      const response1 = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint1.id}`,
        headers: {
          "x-project-key": project1.projectKey,
          "x-idempotency-key": "shared-key",
        },
        payload: { test: true },
      });

      expect(response1.statusCode).toBe(201);
      const body1 = JSON.parse(response1.body);

      // Request for project 2 with same key
      const response2 = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint2.id}`,
        headers: {
          "x-project-key": project2.projectKey,
          "x-idempotency-key": "shared-key",
        },
        payload: { test: true },
      });

      expect(response2.statusCode).toBe(201);
      const body2 = JSON.parse(response2.body);

      // Different events should be created
      expect(body2.eventId).not.toBe(body1.eventId);
    });

    it("should create new event when no idempotency key is provided", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      // First request without idempotency key
      const response1 = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project.projectKey,
        },
        payload: { test: true },
      });

      expect(response1.statusCode).toBe(201);
      const body1 = JSON.parse(response1.body);

      // Second request without idempotency key
      const response2 = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project.projectKey,
        },
        payload: { test: true },
      });

      expect(response2.statusCode).toBe(201);
      const body2 = JSON.parse(response2.body);

      // Different events should be created
      expect(body2.eventId).not.toBe(body1.eventId);
    });

    it("should return 400 when idempotency key exceeds 255 characters", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const longKey = "a".repeat(256);

      const response = await app.inject({
        method: "POST",
        url: `/webhooks/${endpoint.id}`,
        headers: {
          "x-project-key": project.projectKey,
          "x-idempotency-key": longKey,
        },
        payload: { test: true },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Bad Request");
      expect(body.message).toBe("Invalid idempotency key");
    });

    it("should handle endpoint validation correctly", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);

      // Empty endpoint ID in URL path returns validation error
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/",
        headers: {
          "x-project-key": project.projectKey,
        },
        payload: { test: true },
      });

      // Should return 400 for invalid (empty) endpoint ID
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Bad Request");
      expect(body.message).toBe("Invalid endpoint ID");
    });
  });
});

describe.skipIf(skipTests)("Health Check", () => {
  it("should return ok status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(body.service).toContain("api");
  });
});
