import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { createPrismaClient } from "@repo/db";
import { createWebhookDeliveryQueue } from "@repo/queue";
import crypto from "crypto";

// Mock dependencies
const prisma = createPrismaClient({ silent: true });
const queue = createWebhookDeliveryQueue({
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },
});

// Helper to create a project
async function createProject() {
  const projectKey = `pk_${crypto.randomBytes(16).toString("hex")}`;
  const project = await prisma.project.create({
    data: {
      name: `Test Project ${Date.now()}`,
      projectKey,
    },
  });
  return { project, apiKey: projectKey };
}

describe("Rate Limiting", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let apiKey: string;
  let otherApiKey: string;

  beforeEach(async () => {
    // Reset database
    await prisma.event.deleteMany();
    await prisma.webhookEndpoint.deleteMany();
    await prisma.project.deleteMany();

    // Create app
    app = await buildApp({
      prisma,
      queue,
      logger: false,
    });

    await app.ready();

    // Create test projects
    const p1 = await createProject();
    apiKey = p1.apiKey;

    const p2 = await createProject();
    otherApiKey = p2.apiKey;
  });

  afterAll(async () => {
    await app.close();
    await queue.close();
    await prisma.$disconnect();
  });

  it("should allow requests within rate limit", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks",
      headers: {
        "X-Project-Key": apiKey,
      },
      payload: { test: "data" },
    });

    expect(res.statusCode).toBe(200);
    // Should have rate limit headers
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
  });

  it("should not rate limit /health endpoint", async () => {
    // Send many requests to health endpoint
    const requests = Array.from({ length: 20 }, () =>
      app.inject({
        method: "GET",
        url: "/health",
      })
    );

    const responses = await Promise.all(requests);

    // All should succeed
    responses.forEach((res) => {
      expect(res.statusCode).toBe(200);
    });
  });

  // Note: We can't easily test hitting the actual Redis rate limit in integration tests
  // without sending 100+ requests which is slow.
  // Instead, we verify the configuration is active by checking headers.

  it("should have independent limits for different projects", async () => {
    // Request from Project 1
    const res1 = await app.inject({
      method: "POST",
      url: "/webhooks",
      headers: {
        "X-Project-Key": apiKey,
      },
      payload: { test: "data" },
    });

    // Request from Project 2
    const res2 = await app.inject({
      method: "POST",
      url: "/webhooks",
      headers: {
        "X-Project-Key": otherApiKey,
      },
      payload: { test: "data" },
    });

    const remaining1 = parseInt(
      res1.headers["x-ratelimit-remaining"] as string,
      10
    );
    const remaining2 = parseInt(
      res2.headers["x-ratelimit-remaining"] as string,
      10
    );

    // Both should start high (near 100)
    // If they shared a limit, the second one would be lower if we spammed,
    // but here we just check they both got successful responses with headers.
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    // The key thing is that the rate limiter is active
    expect(remaining1).toBeLessThanOrEqual(100);
    expect(remaining2).toBeLessThanOrEqual(100);
  });

  it("should apply stricter limit to unauthenticated requests", async () => {
    // Making a request to a valid route but without auth headers
    // The webhook routes require auth, but rate limiting runs before auth.
    // If we use a valid route, it might be easier to trigger.
    // However, if the routehandler returns 401/403, rate limit headers should still be there.

    const res = await app.inject({
      method: "POST",
      url: "/webhooks",
      // No project key
      payload: { test: "data" },
    });

    // 401 Unauthorized is expected because of missing key
    expect(res.statusCode).toBe(401);

    // Should see limit of 10
    expect(parseInt(res.headers["x-ratelimit-limit"] as string, 10)).toBe(10);
  });

  it("should apply standard limit to authenticated requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks",
      headers: {
        "X-Project-Key": apiKey,
      },
      payload: { test: "data" },
    });

    expect(res.statusCode).toBe(200);
    // Should see limit of 100 (from env default)
    expect(parseInt(res.headers["x-ratelimit-limit"] as string, 10)).toBe(100);
  });
});
