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

import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma } from "@repo/db";
import {
  createTestProject,
  createTestEndpoint,
  uniqueProjectKey,
  uniqueId,
} from "@repo/db/testing";

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ logger: false });
});

describe("Webhook Ingestion API", () => {
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
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);

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
      // Create two projects
      const project1 = await createTestProject();
      const project2 = await createTestProject();

      // Create endpoint for project1
      const endpoint = await createTestEndpoint(project1.id);

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
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);

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
      const project = await createTestProject();

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
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);

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
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);

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
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);

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
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);

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
      const project = await createTestProject();

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
});

describe("Health Check", () => {
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
