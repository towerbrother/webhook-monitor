/**
 * Webhook API Tests
 *
 * Tests for the webhook ingestion API endpoints:
 * - POST /webhooks/:endpointId - Receive webhook for specific endpoint
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
import {
  createTestProject,
  createTestEndpoint,
  createTestEvent,
  createTestDeliveryAttempt,
} from "@repo/db/testing";

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
    it("should return 404 for POST /webhooks (route removed; events must be scoped to an endpoint)", async () => {
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

      expect(response.statusCode).toBe(404);
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

describe.skipIf(skipTests)("GET /webhooks/:endpointId/events", () => {
  it("returns empty array and null cursor when endpoint has no events", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project.id);

    const response = await app.inject({
      method: "GET",
      url: `/webhooks/${endpoint.id}/events`,
      headers: {
        "x-project-key": project.projectKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.events).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it("returns events for the endpoint with id, status, idempotencyKey, receivedAt, method, headers (no body)", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project.id);

    await createTestEvent(prisma, project.id, endpoint.id, {
      idempotencyKey: "key-1",
      headers: { "content-type": "application/json", "x-trace": "a" },
      body: { n: 1 },
    });
    await createTestEvent(prisma, project.id, endpoint.id, {
      idempotencyKey: "key-2",
      headers: { "content-type": "application/json", "x-trace": "b" },
      body: { n: 2 },
    });
    await createTestEvent(prisma, project.id, endpoint.id, {
      idempotencyKey: null,
      headers: { "content-type": "application/json", "x-trace": "c" },
      body: { n: 3 },
    });

    const response = await app.inject({
      method: "GET",
      url: `/webhooks/${endpoint.id}/events`,
      headers: {
        "x-project-key": project.projectKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.events).toHaveLength(3);

    for (const event of body.events) {
      expect(event).toHaveProperty("id");
      expect(event).toHaveProperty("status");
      expect(event).toHaveProperty("idempotencyKey");
      expect(event).toHaveProperty("receivedAt");
      expect(event).toHaveProperty("method");
      expect(event).toHaveProperty("headers");
      // List view must not include body
      expect(event).not.toHaveProperty("body");
    }
  });

  it("returns 404 when requesting another project's endpoint", async () => {
    const prisma = getTestPrisma();
    const project1 = await createTestProject(prisma);
    const project2 = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project1.id);
    await createTestEvent(prisma, project1.id, endpoint.id);

    const response = await app.inject({
      method: "GET",
      url: `/webhooks/${endpoint.id}/events`,
      headers: {
        "x-project-key": project2.projectKey,
      },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("Not Found");
  });

  it("paginates with limit=1 returning nextCursor that fetches the next page", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project.id);

    // Create three events sequentially so receivedAt ordering is deterministic
    const e1 = await createTestEvent(prisma, project.id, endpoint.id, {
      idempotencyKey: "k1",
    });
    const e2 = await createTestEvent(prisma, project.id, endpoint.id, {
      idempotencyKey: "k2",
    });
    const e3 = await createTestEvent(prisma, project.id, endpoint.id, {
      idempotencyKey: "k3",
    });

    // Page 1
    const page1 = await app.inject({
      method: "GET",
      url: `/webhooks/${endpoint.id}/events?limit=1`,
      headers: { "x-project-key": project.projectKey },
    });
    expect(page1.statusCode).toBe(200);
    const body1 = JSON.parse(page1.body);
    expect(body1.events).toHaveLength(1);
    expect(body1.events[0].id).toBe(e3.id); // newest first
    expect(body1.nextCursor).toBeTruthy();

    // Page 2
    const page2 = await app.inject({
      method: "GET",
      url: `/webhooks/${endpoint.id}/events?limit=1&cursor=${body1.nextCursor}`,
      headers: { "x-project-key": project.projectKey },
    });
    expect(page2.statusCode).toBe(200);
    const body2 = JSON.parse(page2.body);
    expect(body2.events).toHaveLength(1);
    expect(body2.events[0].id).toBe(e2.id);
    expect(body2.nextCursor).toBeTruthy();

    // Page 3 (last)
    const page3 = await app.inject({
      method: "GET",
      url: `/webhooks/${endpoint.id}/events?limit=1&cursor=${body2.nextCursor}`,
      headers: { "x-project-key": project.projectKey },
    });
    expect(page3.statusCode).toBe(200);
    const body3 = JSON.parse(page3.body);
    expect(body3.events).toHaveLength(1);
    expect(body3.events[0].id).toBe(e1.id);
    expect(body3.nextCursor).toBeNull();
  });

  it("does not return events from sibling endpoints in the same project", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpointA = await createTestEndpoint(prisma, project.id);
    const endpointB = await createTestEndpoint(prisma, project.id);

    const ownEvent = await createTestEvent(prisma, project.id, endpointA.id, {
      idempotencyKey: "own",
    });
    await createTestEvent(prisma, project.id, endpointB.id, {
      idempotencyKey: "sibling",
    });

    const response = await app.inject({
      method: "GET",
      url: `/webhooks/${endpointA.id}/events`,
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].id).toBe(ownEvent.id);
  });

  it("returns 400 when limit exceeds 100", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project.id);

    const response = await app.inject({
      method: "GET",
      url: `/webhooks/${endpoint.id}/events?limit=101`,
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("Bad Request");
    expect(body.message).toMatch(/exceeds maximum of 100/i);
  });

  it("returns 404 for a nonexistent endpoint id", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);

    const response = await app.inject({
      method: "GET",
      url: "/webhooks/does-not-exist/events",
      headers: {
        "x-project-key": project.projectKey,
      },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe.skipIf(skipTests)("GET /webhooks/:endpointId/events/:eventId", () => {
  it("returns 200 with full event payload and empty deliveryAttempts when no attempts exist", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project.id);
    const event = await createTestEvent(prisma, project.id, endpoint.id, {
      idempotencyKey: "key-detail",
      headers: { "content-type": "application/json" },
      body: { hello: "world" },
    });

    const response = await app.inject({
      method: "GET",
      url: `/webhooks/${endpoint.id}/events/${event.id}`,
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe(event.id);
    expect(body.status).toBe("PENDING");
    expect(body.idempotencyKey).toBe("key-detail");
    expect(body.receivedAt).toBeDefined();
    expect(body.method).toBe("POST");
    expect(body.headers).toBeDefined();
    expect(body.body).toEqual({ hello: "world" });
    expect(body.deliveryAttempts).toEqual([]);
  });

  it("returns deliveryAttempts ordered by attemptNumber ascending", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project.id);
    const event = await createTestEvent(prisma, project.id, endpoint.id);

    await createTestDeliveryAttempt(prisma, event.id, project.id, {
      attemptNumber: 3,
      statusCode: 500,
      success: false,
    });
    await createTestDeliveryAttempt(prisma, event.id, project.id, {
      attemptNumber: 1,
      statusCode: 500,
      success: false,
    });
    await createTestDeliveryAttempt(prisma, event.id, project.id, {
      attemptNumber: 2,
      statusCode: 200,
      success: true,
    });

    const response = await app.inject({
      method: "GET",
      url: `/webhooks/${endpoint.id}/events/${event.id}`,
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.deliveryAttempts).toHaveLength(3);
    expect(body.deliveryAttempts[0].attemptNumber).toBe(1);
    expect(body.deliveryAttempts[1].attemptNumber).toBe(2);
    expect(body.deliveryAttempts[2].attemptNumber).toBe(3);

    const attempt = body.deliveryAttempts[0];
    expect(attempt).toHaveProperty("id");
    expect(attempt).toHaveProperty("attemptNumber");
    expect(attempt).toHaveProperty("requestedAt");
    expect(attempt).toHaveProperty("respondedAt");
    expect(attempt).toHaveProperty("statusCode");
    expect(attempt).toHaveProperty("success");
    expect(attempt).toHaveProperty("errorMessage");
  });

  it("returns 404 for a cross-tenant event", async () => {
    const prisma = getTestPrisma();
    const project1 = await createTestProject(prisma);
    const project2 = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project1.id);
    const event = await createTestEvent(prisma, project1.id, endpoint.id);

    const response = await app.inject({
      method: "GET",
      url: `/webhooks/${endpoint.id}/events/${event.id}`,
      headers: { "x-project-key": project2.projectKey },
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 404 when endpointId does not match the event's endpoint", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpointA = await createTestEndpoint(prisma, project.id);
    const endpointB = await createTestEndpoint(prisma, project.id);
    const event = await createTestEvent(prisma, project.id, endpointA.id);

    const response = await app.inject({
      method: "GET",
      url: `/webhooks/${endpointB.id}/events/${event.id}`,
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 404 for a nonexistent event id", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project.id);

    const response = await app.inject({
      method: "GET",
      url: `/webhooks/${endpoint.id}/events/does-not-exist`,
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(404);
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
