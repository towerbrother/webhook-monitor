import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
  app = await buildApp({ prisma, queue, logger: false });
});

afterAll(async () => {
  await queue.close();
  await app.close();
});

const skipTests = !process.env.DATABASE_URL;

describe.skipIf(skipTests)("POST /endpoints", () => {
  it("creates endpoint with valid url and name, returns 201", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);

    const response = await app.inject({
      method: "POST",
      url: "/endpoints",
      headers: { "x-project-key": project.projectKey },
      payload: { url: "https://example.com/webhook", name: "My Endpoint" },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.id).toBeDefined();
    expect(body.url).toBe("https://example.com/webhook");
    expect(body.name).toBe("My Endpoint");
    expect(body.projectId).toBe(project.id);
    expect(body.createdAt).toBeDefined();
    expect(body).not.toHaveProperty("signingSecret");
  });

  it("persists endpoint in database", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);

    const response = await app.inject({
      method: "POST",
      url: "/endpoints",
      headers: { "x-project-key": project.projectKey },
      payload: { url: "https://example.com/persist-test", name: "Persist Test" },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    const saved = await prisma.webhookEndpoint.findUnique({ where: { id: body.id } });
    expect(saved).not.toBeNull();
    expect(saved!.projectId).toBe(project.id);
  });

  it("returns 400 for invalid URL", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);

    const response = await app.inject({
      method: "POST",
      url: "/endpoints",
      headers: { "x-project-key": project.projectKey },
      payload: { url: "not-a-url", name: "My Endpoint" },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("Bad Request");
  });

  it("returns 400 when name is empty", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);

    const response = await app.inject({
      method: "POST",
      url: "/endpoints",
      headers: { "x-project-key": project.projectKey },
      payload: { url: "https://example.com/webhook", name: "" },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("Bad Request");
  });

  it("returns 400 when url is missing", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);

    const response = await app.inject({
      method: "POST",
      url: "/endpoints",
      headers: { "x-project-key": project.projectKey },
      payload: { name: "My Endpoint" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/endpoints",
      payload: { url: "https://example.com/webhook", name: "My Endpoint" },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe.skipIf(skipTests)("GET /endpoints", () => {
  it("returns only authenticated project's endpoints", async () => {
    const prisma = getTestPrisma();
    const project1 = await createTestProject(prisma);
    const project2 = await createTestProject(prisma);
    await createTestEndpoint(prisma, project1.id, { name: "Endpoint A" });
    await createTestEndpoint(prisma, project2.id, { name: "Endpoint B" });

    const response = await app.inject({
      method: "GET",
      url: "/endpoints",
      headers: { "x-project-key": project1.projectKey },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Endpoint A");
    expect(body[0]).not.toHaveProperty("signingSecret");
  });

  it("returns empty array when no endpoints exist", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);

    const response = await app.inject({
      method: "GET",
      url: "/endpoints",
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual([]);
  });

  it("response items include id, url, name, projectId, createdAt", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    await createTestEndpoint(prisma, project.id);

    const response = await app.inject({
      method: "GET",
      url: "/endpoints",
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveLength(1);
    const ep = body[0];
    expect(ep).toHaveProperty("id");
    expect(ep).toHaveProperty("url");
    expect(ep).toHaveProperty("name");
    expect(ep).toHaveProperty("projectId");
    expect(ep).toHaveProperty("createdAt");
  });
});

describe.skipIf(skipTests)("GET /endpoints/:endpointId", () => {
  it("returns 200 with endpoint data for own endpoint", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project.id);

    const response = await app.inject({
      method: "GET",
      url: `/endpoints/${endpoint.id}`,
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe(endpoint.id);
    expect(body.url).toBe(endpoint.url);
    expect(body.name).toBe(endpoint.name);
    expect(body.projectId).toBe(project.id);
    expect(body).not.toHaveProperty("signingSecret");
  });

  it("returns 404 for cross-tenant access", async () => {
    const prisma = getTestPrisma();
    const project1 = await createTestProject(prisma);
    const project2 = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project1.id);

    const response = await app.inject({
      method: "GET",
      url: `/endpoints/${endpoint.id}`,
      headers: { "x-project-key": project2.projectKey },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("Not Found");
  });

  it("returns 404 for non-existent endpoint", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);

    const response = await app.inject({
      method: "GET",
      url: "/endpoints/does-not-exist",
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe.skipIf(skipTests)("DELETE /endpoints/:endpointId", () => {
  it("deletes endpoint and returns 204", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project.id);

    const response = await app.inject({
      method: "DELETE",
      url: `/endpoints/${endpoint.id}`,
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(204);
    const deleted = await prisma.webhookEndpoint.findUnique({
      where: { id: endpoint.id },
    });
    expect(deleted).toBeNull();
  });

  it("cascades delete of associated events", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project.id);
    const event = await createTestEvent(prisma, project.id, endpoint.id);

    const response = await app.inject({
      method: "DELETE",
      url: `/endpoints/${endpoint.id}`,
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(204);
    const deletedEvent = await prisma.event.findUnique({ where: { id: event.id } });
    expect(deletedEvent).toBeNull();
  });

  it("returns 404 for cross-tenant delete", async () => {
    const prisma = getTestPrisma();
    const project1 = await createTestProject(prisma);
    const project2 = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project1.id);

    const response = await app.inject({
      method: "DELETE",
      url: `/endpoints/${endpoint.id}`,
      headers: { "x-project-key": project2.projectKey },
    });

    expect(response.statusCode).toBe(404);
    const still = await prisma.webhookEndpoint.findUnique({
      where: { id: endpoint.id },
    });
    expect(still).not.toBeNull();
  });

  it("returns 404 for non-existent endpoint", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);

    const response = await app.inject({
      method: "DELETE",
      url: "/endpoints/does-not-exist",
      headers: { "x-project-key": project.projectKey },
    });

    expect(response.statusCode).toBe(404);
  });
});
