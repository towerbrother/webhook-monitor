/**
 * Schema constraint tests for @repo/db
 *
 * These tests verify that database-level invariants are enforced:
 * - Foreign key constraints
 * - Unique constraints (idempotency)
 * - Cascade delete behavior
 */

import { describe, it, expect } from "vitest";
import { prisma } from "../index.js";
import {
  createTestProject,
  createTestEndpoint,
  createTestEvent,
  isUniqueConstraintError,
  isForeignKeyConstraintError,
  uniqueId,
} from "./helpers.js";

describe("Schema Constraints", () => {
  describe("Project", () => {
    it("should create a project successfully", async () => {
      const project = await createTestProject();

      expect(project.id).toBeDefined();
      expect(project.name).toBeDefined();
      expect(project.projectKey).toBeDefined();
      expect(project.createdAt).toBeInstanceOf(Date);
    });

    it("should enforce unique projectKey constraint", async () => {
      const projectKey = `pk_unique_${uniqueId()}`;

      await createTestProject({ projectKey });

      await expect(createTestProject({ projectKey })).rejects.toSatisfy(
        isUniqueConstraintError
      );
    });
  });

  describe("WebhookEndpoint", () => {
    it("should create an endpoint linked to a project", async () => {
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);

      expect(endpoint.id).toBeDefined();
      expect(endpoint.projectId).toBe(project.id);
    });

    it("should reject endpoint creation with invalid projectId", async () => {
      await expect(
        createTestEndpoint("non_existent_project_id")
      ).rejects.toSatisfy(isForeignKeyConstraintError);
    });

    it("should enforce unique url constraint", async () => {
      const project = await createTestProject();
      const url = `https://example.com/webhook/${uniqueId()}`;

      await createTestEndpoint(project.id, { url });

      await expect(createTestEndpoint(project.id, { url })).rejects.toSatisfy(
        isUniqueConstraintError
      );
    });
  });

  describe("Event", () => {
    it("should create an event linked to project and endpoint", async () => {
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);
      const event = await createTestEvent(project.id, endpoint.id);

      expect(event.id).toBeDefined();
      expect(event.projectId).toBe(project.id);
      expect(event.endpointId).toBe(endpoint.id);
    });

    it("should reject event creation with invalid projectId", async () => {
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);

      await expect(
        createTestEvent("non_existent_project_id", endpoint.id)
      ).rejects.toSatisfy(isForeignKeyConstraintError);
    });

    it("should reject event creation with invalid endpointId", async () => {
      const project = await createTestProject();

      await expect(
        createTestEvent(project.id, "non_existent_endpoint_id")
      ).rejects.toSatisfy(isForeignKeyConstraintError);
    });
  });

  describe("Idempotency Key Constraint", () => {
    it("should allow duplicate idempotencyKey across different projects", async () => {
      const project1 = await createTestProject();
      const project2 = await createTestProject();
      const endpoint1 = await createTestEndpoint(project1.id);
      const endpoint2 = await createTestEndpoint(project2.id);

      const idempotencyKey = `idem_${uniqueId()}`;

      // Same idempotency key in different projects should succeed
      const event1 = await createTestEvent(project1.id, endpoint1.id, {
        idempotencyKey,
      });
      const event2 = await createTestEvent(project2.id, endpoint2.id, {
        idempotencyKey,
      });

      expect(event1.idempotencyKey).toBe(idempotencyKey);
      expect(event2.idempotencyKey).toBe(idempotencyKey);
      expect(event1.projectId).not.toBe(event2.projectId);
    });

    it("should reject duplicate idempotencyKey within same project", async () => {
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);

      const idempotencyKey = `idem_${uniqueId()}`;

      await createTestEvent(project.id, endpoint.id, { idempotencyKey });

      await expect(
        createTestEvent(project.id, endpoint.id, { idempotencyKey })
      ).rejects.toSatisfy(isUniqueConstraintError);
    });

    it("should allow null idempotencyKey for multiple events", async () => {
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);

      // Multiple events without idempotency key should succeed
      const event1 = await createTestEvent(project.id, endpoint.id, {
        idempotencyKey: null,
      });
      const event2 = await createTestEvent(project.id, endpoint.id, {
        idempotencyKey: null,
      });

      expect(event1.idempotencyKey).toBeNull();
      expect(event2.idempotencyKey).toBeNull();
      expect(event1.id).not.toBe(event2.id);
    });
  });

  describe("Cascade Delete", () => {
    it("should cascade delete endpoints when project is deleted", async () => {
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);

      await prisma.project.delete({ where: { id: project.id } });

      const deletedEndpoint = await prisma.webhookEndpoint.findUnique({
        where: { id: endpoint.id },
      });

      expect(deletedEndpoint).toBeNull();
    });

    it("should cascade delete events when project is deleted", async () => {
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);
      const event = await createTestEvent(project.id, endpoint.id);

      await prisma.project.delete({ where: { id: project.id } });

      const deletedEvent = await prisma.event.findUnique({
        where: { id: event.id },
      });

      expect(deletedEvent).toBeNull();
    });

    it("should cascade delete events when endpoint is deleted", async () => {
      const project = await createTestProject();
      const endpoint = await createTestEndpoint(project.id);
      const event = await createTestEvent(project.id, endpoint.id);

      await prisma.webhookEndpoint.delete({ where: { id: endpoint.id } });

      const deletedEvent = await prisma.event.findUnique({
        where: { id: event.id },
      });

      expect(deletedEvent).toBeNull();
    });
  });
});
