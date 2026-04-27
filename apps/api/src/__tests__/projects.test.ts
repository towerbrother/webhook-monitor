import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { getTestPrisma } from "./setup.js";
import {
  createWebhookDeliveryQueue,
  type Queue,
  type WebhookDeliveryJobData,
} from "@repo/queue";
import { createTestProject } from "@repo/db/testing";
import { Prisma } from "@repo/db";

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
  app = await buildApp({ prisma, queue, logger: false });
});

afterAll(async () => {
  await queue.close();
  await app.close();
});

const skipTests = !process.env.DATABASE_URL;

describe.skipIf(skipTests)("POST /projects", () => {
  it("creates project with valid name, returns 201 with projectKey", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/projects",
      payload: { name: "My Project" },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.id).toBeDefined();
    expect(body.name).toBe("My Project");
    expect(body.projectKey).toBeDefined();
    expect(typeof body.projectKey).toBe("string");
    // projectKey should be a UUID format
    expect(body.projectKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(body.createdAt).toBeDefined();
  });

  it("persists project in database", async () => {
    const prisma = getTestPrisma();
    const response = await app.inject({
      method: "POST",
      url: "/projects",
      payload: { name: "Persist Test Project" },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    const saved = await prisma.project.findUnique({ where: { id: body.id } });
    expect(saved).not.toBeNull();
    expect(saved!.name).toBe("Persist Test Project");
    expect(saved!.projectKey).toBe(body.projectKey);
  });

  it("returns 400 when name is empty", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/projects",
      payload: { name: "" },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("Bad Request");
  });

  it("returns 400 when name is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/projects",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("Bad Request");
  });

  it("does not require authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/projects",
      payload: { name: "Unauthenticated Project" },
    });

    expect(response.statusCode).toBe(201);
  });
});

describe.skipIf(skipTests)("GET /projects", () => {
  it("returns all projects with masked keys", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma, { name: "Masked Key Test" });

    const response = await app.inject({
      method: "GET",
      url: "/projects",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);

    const found = body.find((p: { id: string }) => p.id === project.id);
    expect(found).toBeDefined();
    expect(found.name).toBe("Masked Key Test");
    expect(found.maskedKey).toBeDefined();
    expect(found).not.toHaveProperty("projectKey");
    // maskedKey should be first8 + '...' + last4
    expect(found.maskedKey).toMatch(/^.{8}\.\.\.(.{4})$/);
  });

  it("never returns full projectKey in list", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);

    const response = await app.inject({
      method: "GET",
      url: "/projects",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const found = body.find((p: { id: string }) => p.id === project.id);
    expect(found).toBeDefined();
    // Full projectKey should never appear in response
    expect(found.projectKey).toBeUndefined();
    // maskedKey must not equal the full key
    expect(found.maskedKey).not.toBe(project.projectKey);
  });

  it("does not require authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/projects",
    });

    expect(response.statusCode).toBe(200);
  });
});

describe.skipIf(skipTests)("DELETE /projects/:projectId", () => {
  it("deletes project and returns 204", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);

    const response = await app.inject({
      method: "DELETE",
      url: `/projects/${project.id}`,
    });

    expect(response.statusCode).toBe(204);
    const deleted = await prisma.project.findUnique({
      where: { id: project.id },
    });
    expect(deleted).toBeNull();
  });

  it("cascades delete of endpoints and events", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        projectId: project.id,
        url: `https://example.com/cascade-test-${Date.now()}`,
        name: "Cascade Test Endpoint",
      },
    });
    const event = await prisma.event.create({
      data: {
        projectId: project.id,
        endpointId: endpoint.id,
        method: "POST",
        headers: {},
        body: Prisma.JsonNull,
      },
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/projects/${project.id}`,
    });

    expect(response.statusCode).toBe(204);

    const deletedEndpoint = await prisma.webhookEndpoint.findUnique({
      where: { id: endpoint.id },
    });
    expect(deletedEndpoint).toBeNull();

    const deletedEvent = await prisma.event.findUnique({
      where: { id: event.id },
    });
    expect(deletedEvent).toBeNull();
  });

  it("returns 404 for non-existent project", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/does-not-exist",
    });

    expect(response.statusCode).toBe(404);
  });

  it("does not require authentication", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);

    const response = await app.inject({
      method: "DELETE",
      url: `/projects/${project.id}`,
    });

    expect(response.statusCode).toBe(204);
  });
});
