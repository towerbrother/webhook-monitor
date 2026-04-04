/**
 * Prometheus Metrics Tests
 *
 * Validates the GET /metrics endpoint:
 * - Returns valid Prometheus text format
 * - Returns 401 when auth token is configured and request has wrong/missing token
 * - Returns 200 when auth token matches
 * - Endpoint is not rate-limited and does not require project auth
 * - Counter increments after a successful webhook ingest
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { getTestPrisma } from "./setup.js";
import {
  createWebhookDeliveryQueue,
  type Queue,
  type WebhookDeliveryJobData,
} from "@repo/queue";
import { createTestProject, createTestEndpoint } from "@repo/db/testing";
import { registry } from "@repo/shared";

const skipTests = !process.env.DATABASE_URL;

let appOpen: FastifyInstance;
let appProtected: FastifyInstance;
let queue: Queue<WebhookDeliveryJobData>;

beforeAll(async () => {
  if (skipTests) return;

  const prisma = getTestPrisma();

  queue = createWebhookDeliveryQueue({
    redis: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
      maxRetriesPerRequest: null,
    },
  });
  await queue.waitUntilReady();

  appOpen = await buildApp({ prisma, queue, logger: false });
  appProtected = await buildApp({
    prisma,
    queue,
    logger: false,
    metricsAuthToken: "secret-token",
  });
});

afterAll(async () => {
  if (skipTests) return;
  await queue.obliterate({ force: true });
  await queue.close();
  await appOpen.close();
  await appProtected.close();
});

describe.skipIf(skipTests)("GET /metrics", () => {
  it("returns 200 with Prometheus text format when no auth is configured", async () => {
    const response = await appOpen.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("# HELP");
    expect(response.body).toContain("# TYPE");
  });

  it("returns 401 when auth token is required but missing", async () => {
    const response = await appProtected.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 401 when auth token is wrong", async () => {
    const response = await appProtected.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer wrong-token" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 200 when auth token matches", async () => {
    const response = await appProtected.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer secret-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("# HELP");
  });

  it("includes webhook_events_received_total counter", async () => {
    const response = await appOpen.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(response.body).toContain("webhook_events_received_total");
  });

  it("increments webhook_events_received_total after a successful ingest", async () => {
    const prisma = getTestPrisma();
    const project = await createTestProject(prisma);
    const endpoint = await createTestEndpoint(prisma, project.id);

    // Get current count before
    const metricsBefore = await registry
      .getSingleMetricAsString("webhook_events_received_total")
      .catch(() => "");
    const matchBefore = metricsBefore.match(
      new RegExp(`webhook_events_received_total\\{[^}]*project_id="${project.id}"[^}]*\\}\\s+(\\d+)`)
    );
    const countBefore = matchBefore?.[1] != null ? parseInt(matchBefore[1], 10) : 0;

    // Ingest a webhook
    const ingestResponse = await appOpen.inject({
      method: "POST",
      url: `/webhooks/${endpoint.id}`,
      headers: { "x-project-key": project.projectKey },
      payload: { test: true },
    });
    expect(ingestResponse.statusCode).toBe(201);

    // Check counter incremented
    const metricsAfter = await registry
      .getSingleMetricAsString("webhook_events_received_total")
      .catch(() => "");
    const matchAfter = metricsAfter.match(
      new RegExp(`webhook_events_received_total\\{[^}]*project_id="${project.id}"[^}]*\\}\\s+(\\d+)`)
    );
    const countAfter = matchAfter?.[1] != null ? parseInt(matchAfter[1], 10) : 0;

    expect(countAfter).toBe(countBefore + 1);
  });
});
