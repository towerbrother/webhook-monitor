/**
 * Rate Limiting Tests
 *
 * Validates per-project Redis-backed rate limiting:
 * - 429 after limit is exceeded for the same project
 * - Independent counters per project
 * - Fail-closed (503) when Redis is unavailable
 * - Fail-open (in-memory fallback) when Redis is unavailable
 * - /health endpoint is never rate-limited
 *
 * Redis is mocked for failure scenarios; a real connection is used for
 * the happy-path counter tests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { buildApp } from "../app.js";
import { getTestPrisma } from "./setup.js";
import {
  createWebhookDeliveryQueue,
  type Queue,
  type WebhookDeliveryJobData,
} from "@repo/queue";
import { createTestProject, createTestEndpoint } from "@repo/db/testing";

// Skip all tests when there is no database
const skipTests = !process.env.DATABASE_URL;

/** Minimal fake Redis whose pipeline exec() always rejects */
function makeBrokenRedis(): Redis {
  const pipeline = {
    incr() {
      return pipeline;
    },
    pttl() {
      return pipeline;
    },
    exec() {
      return Promise.reject(new Error("Redis connection refused"));
    },
  };

  return {
    pipeline() {
      return pipeline;
    },
    pexpire() {
      return Promise.reject(new Error("Redis connection refused"));
    },
  } as unknown as Redis;
}

let queue: Queue<WebhookDeliveryJobData>;

beforeAll(async () => {
  if (skipTests) return;

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
});

beforeEach(async () => {
  if (!queue) return;
  await queue.obliterate({ force: true });
});

afterAll(async () => {
  if (queue) {
    await queue.obliterate({ force: true });
    await queue.close();
  }
});

describe.skipIf(skipTests)("Rate Limiting", () => {
  describe("Per-project counter", () => {
    it("returns 429 with Retry-After on the request that exceeds the limit", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const redis = new Redis({
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
        db: parseInt(process.env.REDIS_DB ?? "0", 10),
      });

      // Use a low limit so the test doesn't need 100+ requests
      const rateLimitMax = 5;
      const app: FastifyInstance = await buildApp({
        prisma,
        queue,
        logger: false,
        redis,
        rateLimitMax,
        rateLimitWindowMs: 60_000,
        rateLimitFailOpen: false,
      });

      try {
        const sendRequest = () =>
          app.inject({
            method: "POST",
            url: `/webhooks/${endpoint.id}`,
            headers: { "x-project-key": project.projectKey },
            payload: { test: true },
          });

        // Exhaust the limit
        for (let i = 0; i < rateLimitMax; i++) {
          const res = await sendRequest();
          expect(res.statusCode).toBe(201);
        }

        // This request exceeds the limit
        const exceeded = await sendRequest();
        expect(exceeded.statusCode).toBe(429);
        expect(exceeded.headers["retry-after"]).toBeDefined();
      } finally {
        await app.close();
        await redis.quit();
      }
    });

    it("returns 200 on first request from a different project after one project is rate-limited", async () => {
      const prisma = getTestPrisma();
      const project1 = await createTestProject(prisma);
      const project2 = await createTestProject(prisma);
      const endpoint1 = await createTestEndpoint(prisma, project1.id);
      const endpoint2 = await createTestEndpoint(prisma, project2.id);

      const redis = new Redis({
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
        db: parseInt(process.env.REDIS_DB ?? "0", 10),
      });

      const rateLimitMax = 3;
      const app: FastifyInstance = await buildApp({
        prisma,
        queue,
        logger: false,
        redis,
        rateLimitMax,
        rateLimitWindowMs: 60_000,
        rateLimitFailOpen: false,
      });

      try {
        // Exhaust project1's limit
        for (let i = 0; i < rateLimitMax; i++) {
          await app.inject({
            method: "POST",
            url: `/webhooks/${endpoint1.id}`,
            headers: { "x-project-key": project1.projectKey },
            payload: {},
          });
        }
        const blocked = await app.inject({
          method: "POST",
          url: `/webhooks/${endpoint1.id}`,
          headers: { "x-project-key": project1.projectKey },
          payload: {},
        });
        expect(blocked.statusCode).toBe(429);

        // project2 has its own counter — first request should succeed
        const allowed = await app.inject({
          method: "POST",
          url: `/webhooks/${endpoint2.id}`,
          headers: { "x-project-key": project2.projectKey },
          payload: {},
        });
        expect(allowed.statusCode).toBe(201);
      } finally {
        await app.close();
        await redis.quit();
      }
    });
  });

  describe("Redis failure handling", () => {
    it("returns 503 when Redis is down and RATE_LIMIT_FAIL_OPEN=false", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const app: FastifyInstance = await buildApp({
        prisma,
        queue,
        logger: false,
        redis: makeBrokenRedis(),
        rateLimitMax: 100,
        rateLimitWindowMs: 60_000,
        rateLimitFailOpen: false,
      });

      try {
        const res = await app.inject({
          method: "POST",
          url: `/webhooks/${endpoint.id}`,
          headers: { "x-project-key": project.projectKey },
          payload: {},
        });
        expect(res.statusCode).toBe(503);
      } finally {
        await app.close();
      }
    });

    it("returns 201 when Redis is down and RATE_LIMIT_FAIL_OPEN=true (in-memory fallback)", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const app: FastifyInstance = await buildApp({
        prisma,
        queue,
        logger: false,
        redis: makeBrokenRedis(),
        rateLimitMax: 100,
        rateLimitWindowMs: 60_000,
        rateLimitFailOpen: true,
      });

      try {
        const res = await app.inject({
          method: "POST",
          url: `/webhooks/${endpoint.id}`,
          headers: { "x-project-key": project.projectKey },
          payload: {},
        });
        expect(res.statusCode).toBe(201);
      } finally {
        await app.close();
      }
    });
  });

  describe("/health exclusion", () => {
    it("never rate-limits the /health endpoint", async () => {
      // /health is registered outside webhookRoutes so it is not covered by
      // the rate-limit plugin even when Redis is broken and fail-closed.
      const prisma = getTestPrisma();

      const app: FastifyInstance = await buildApp({
        prisma,
        queue,
        logger: false,
        redis: makeBrokenRedis(),
        rateLimitMax: 1,
        rateLimitWindowMs: 60_000,
        rateLimitFailOpen: false,
      });

      try {
        for (let i = 0; i < 5; i++) {
          const res = await app.inject({ method: "GET", url: "/health" });
          expect(res.statusCode).toBe(200);
        }
      } finally {
        await app.close();
      }
    });
  });
});
