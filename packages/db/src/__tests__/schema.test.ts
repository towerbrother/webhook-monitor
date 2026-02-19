import { describe, it, expect } from "vitest";
import { getTestPrisma } from "./setup.js";
import {
  createTestProject,
  createTestEndpoint,
  createTestEvent,
  isUniqueConstraintError,
  isForeignKeyConstraintError,
  uniqueId,
} from "./helpers.js";

// Skip tests if DATABASE_URL is not set
const skipTests = !process.env.DATABASE_URL;

describe.skipIf(skipTests)("Schema Constraints", () => {
  describe("Project", () => {
    it("should create a project successfully", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);

      expect(project.id).toBeDefined();
      expect(project.name).toBeDefined();
      expect(project.projectKey).toBeDefined();
      expect(project.createdAt).toBeInstanceOf(Date);
    });

    it("should enforce unique projectKey constraint", async () => {
      const prisma = getTestPrisma();
      const projectKey = `pk_unique_${uniqueId()}`;

      await createTestProject(prisma, { projectKey });

      await expect(createTestProject(prisma, { projectKey })).rejects.toSatisfy(
        isUniqueConstraintError
      );
    });
  });

  describe("WebhookEndpoint", () => {
    it("should create an endpoint linked to a project", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      expect(endpoint.id).toBeDefined();
      expect(endpoint.projectId).toBe(project.id);
    });

    it("should reject endpoint creation with invalid projectId", async () => {
      const prisma = getTestPrisma();
      await expect(
        createTestEndpoint(prisma, "non_existent_project_id")
      ).rejects.toSatisfy(isForeignKeyConstraintError);
    });

    it("should enforce unique url constraint", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const url = `https://example.com/webhook/${uniqueId()}`;

      await createTestEndpoint(prisma, project.id, { url });

      await expect(
        createTestEndpoint(prisma, project.id, { url })
      ).rejects.toSatisfy(isUniqueConstraintError);
    });
  });

  describe("Event", () => {
    it("should create an event linked to project and endpoint", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);
      const event = await createTestEvent(prisma, project.id, endpoint.id);

      expect(event.id).toBeDefined();
      expect(event.projectId).toBe(project.id);
      expect(event.endpointId).toBe(endpoint.id);
    });

    it("should reject event creation with invalid projectId", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      await expect(
        createTestEvent(prisma, "non_existent_project_id", endpoint.id)
      ).rejects.toSatisfy(isForeignKeyConstraintError);
    });

    it("should reject event creation with invalid endpointId", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);

      await expect(
        createTestEvent(prisma, project.id, "non_existent_endpoint_id")
      ).rejects.toSatisfy(isForeignKeyConstraintError);
    });
  });

  describe("Idempotency Key Constraint", () => {
    it("should allow duplicate idempotencyKey across different projects", async () => {
      const prisma = getTestPrisma();
      const project1 = await createTestProject(prisma);
      const project2 = await createTestProject(prisma);
      const endpoint1 = await createTestEndpoint(prisma, project1.id);
      const endpoint2 = await createTestEndpoint(prisma, project2.id);

      const idempotencyKey = `idem_${uniqueId()}`;

      // Same idempotency key in different projects should succeed
      const event1 = await createTestEvent(prisma, project1.id, endpoint1.id, {
        idempotencyKey,
      });
      const event2 = await createTestEvent(prisma, project2.id, endpoint2.id, {
        idempotencyKey,
      });

      expect(event1.idempotencyKey).toBe(idempotencyKey);
      expect(event2.idempotencyKey).toBe(idempotencyKey);
      expect(event1.projectId).not.toBe(event2.projectId);
    });

    it("should reject duplicate idempotencyKey within same project", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const idempotencyKey = `idem_${uniqueId()}`;

      await createTestEvent(prisma, project.id, endpoint.id, {
        idempotencyKey,
      });

      await expect(
        createTestEvent(prisma, project.id, endpoint.id, { idempotencyKey })
      ).rejects.toSatisfy(isUniqueConstraintError);
    });

    it("should allow null idempotencyKey for multiple events", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      // Multiple events without idempotency key should succeed
      const event1 = await createTestEvent(prisma, project.id, endpoint.id, {
        idempotencyKey: null,
      });
      const event2 = await createTestEvent(prisma, project.id, endpoint.id, {
        idempotencyKey: null,
      });

      expect(event1.idempotencyKey).toBeNull();
      expect(event2.idempotencyKey).toBeNull();
      expect(event1.id).not.toBe(event2.id);
    });
  });

  describe("Cascade Delete", () => {
    it("should cascade delete endpoints when project is deleted", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      await prisma.project.delete({ where: { id: project.id } });

      const deletedEndpoint = await prisma.webhookEndpoint.findUnique({
        where: { id: endpoint.id },
      });

      expect(deletedEndpoint).toBeNull();
    });

    it("should cascade delete events when project is deleted", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);
      const event = await createTestEvent(prisma, project.id, endpoint.id);

      await prisma.project.delete({ where: { id: project.id } });

      const deletedEvent = await prisma.event.findUnique({
        where: { id: event.id },
      });

      expect(deletedEvent).toBeNull();
    });

    it("should cascade delete events when endpoint is deleted", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);
      const event = await createTestEvent(prisma, project.id, endpoint.id);

      await prisma.webhookEndpoint.delete({ where: { id: endpoint.id } });

      const deletedEvent = await prisma.event.findUnique({
        where: { id: event.id },
      });

      expect(deletedEvent).toBeNull();
    });
  });

  describe("Raw Payload Storage", () => {
    it("should store and retrieve complex headers JSON", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const complexHeaders = {
        "content-type": "application/json",
        "x-custom-header": "value",
        "x-array-header": ["value1", "value2"],
        "x-nested": { key: "value", nested: { deep: true } },
      };

      const event = await createTestEvent(prisma, project.id, endpoint.id, {
        headers: complexHeaders,
      });

      const retrieved = await prisma.event.findUnique({
        where: { id: event.id },
      });

      expect(retrieved?.headers).toEqual(complexHeaders);
    });

    it("should store and retrieve complex body JSON", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const complexBody = {
        action: "webhook.received",
        data: {
          id: 12345,
          nested: {
            array: [1, 2, 3],
            object: { key: "value" },
          },
        },
        timestamp: "2024-01-01T00:00:00Z",
      };

      const event = await createTestEvent(prisma, project.id, endpoint.id, {
        body: complexBody,
      });

      const retrieved = await prisma.event.findUnique({
        where: { id: event.id },
      });

      expect(retrieved?.body).toEqual(complexBody);
    });

    it("should allow null body (webhooks may have empty body)", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const event = await createTestEvent(prisma, project.id, endpoint.id, {
        body: null,
      });

      const retrieved = await prisma.event.findUnique({
        where: { id: event.id },
      });

      expect(retrieved?.body).toBeNull();
    });

    it("should preserve exact JSON structure without modification", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      // Test edge cases: empty objects, empty arrays, special characters
      const edgeCaseBody = {
        emptyObject: {},
        emptyArray: [],
        specialChars: 'hello\nworld\t"quoted"',
        unicode: "日本語 🎉",
        numbers: { int: 42, float: 3.14, negative: -1, zero: 0 },
        booleans: { t: true, f: false },
        nullValue: null,
      };

      const event = await createTestEvent(prisma, project.id, endpoint.id, {
        body: edgeCaseBody,
      });

      const retrieved = await prisma.event.findUnique({
        where: { id: event.id },
      });

      expect(retrieved?.body).toEqual(edgeCaseBody);
    });
  });

  describe("Required Field Constraints", () => {
    it("should require name for Project", async () => {
      const prisma = getTestPrisma();
      // Use type assertion to bypass TypeScript and test database constraint
      const invalidData = { projectKey: uniqueId("pk") } as Parameters<
        typeof prisma.project.create
      >[0]["data"];

      await expect(
        prisma.project.create({ data: invalidData })
      ).rejects.toThrow();
    });

    it("should require projectKey for Project", async () => {
      const prisma = getTestPrisma();
      const invalidData = { name: "Test Project" } as Parameters<
        typeof prisma.project.create
      >[0]["data"];

      await expect(
        prisma.project.create({ data: invalidData })
      ).rejects.toThrow();
    });

    it("should require url for WebhookEndpoint", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);

      const invalidData = {
        name: "Test Endpoint",
        projectId: project.id,
      } as Parameters<typeof prisma.webhookEndpoint.create>[0]["data"];

      await expect(
        prisma.webhookEndpoint.create({ data: invalidData })
      ).rejects.toThrow();
    });

    it("should require name for WebhookEndpoint", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);

      const invalidData = {
        url: `https://example.com/${uniqueId()}`,
        projectId: project.id,
      } as Parameters<typeof prisma.webhookEndpoint.create>[0]["data"];

      await expect(
        prisma.webhookEndpoint.create({ data: invalidData })
      ).rejects.toThrow();
    });

    it("should require method for Event", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const invalidData = {
        projectId: project.id,
        endpointId: endpoint.id,
        headers: {},
      } as Parameters<typeof prisma.event.create>[0]["data"];

      await expect(
        prisma.event.create({ data: invalidData })
      ).rejects.toThrow();
    });

    it("should require headers for Event", async () => {
      const prisma = getTestPrisma();
      const project = await createTestProject(prisma);
      const endpoint = await createTestEndpoint(prisma, project.id);

      const invalidData = {
        projectId: project.id,
        endpointId: endpoint.id,
        method: "POST",
      } as Parameters<typeof prisma.event.create>[0]["data"];

      await expect(
        prisma.event.create({ data: invalidData })
      ).rejects.toThrow();
    });
  });
});
