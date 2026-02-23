/**
 * Domain function tests for @repo/db
 *
 * These tests verify application-level invariants that cannot be enforced
 * at the database level alone.
 */

import { describe, it, expect } from "vitest";
import {
  validateEventProjectScope,
  canTransition,
  EventStatus,
} from "../domain.js";

describe("Domain Functions", () => {
  describe("validateEventProjectScope", () => {
    it("should return true when event.projectId matches endpoint.projectId", () => {
      const event = { projectId: "project_123" };
      const endpoint = { projectId: "project_123" };

      expect(validateEventProjectScope(event, endpoint)).toBe(true);
    });

    it("should return false when event.projectId does not match endpoint.projectId", () => {
      const event = { projectId: "project_123" };
      const endpoint = { projectId: "project_456" };

      expect(validateEventProjectScope(event, endpoint)).toBe(false);
    });

    it("should return false when projectIds are similar but not equal", () => {
      const event = { projectId: "project_123" };
      const endpoint = { projectId: "project_123 " }; // trailing space

      expect(validateEventProjectScope(event, endpoint)).toBe(false);
    });

    it("should handle empty strings correctly", () => {
      const event = { projectId: "" };
      const endpoint = { projectId: "" };

      expect(validateEventProjectScope(event, endpoint)).toBe(true);
    });

    it("should distinguish between empty and whitespace-only projectIds", () => {
      const event = { projectId: "" };
      const endpoint = { projectId: " " };

      expect(validateEventProjectScope(event, endpoint)).toBe(false);
    });
  });
});

describe("canTransition", () => {
  describe("valid transitions from PENDING", () => {
    it("PENDING → RETRYING is allowed", () => {
      expect(canTransition(EventStatus.PENDING, EventStatus.RETRYING)).toBe(
        true
      );
    });

    it("PENDING → DELIVERED is allowed", () => {
      expect(canTransition(EventStatus.PENDING, EventStatus.DELIVERED)).toBe(
        true
      );
    });

    it("PENDING → FAILED is allowed", () => {
      expect(canTransition(EventStatus.PENDING, EventStatus.FAILED)).toBe(true);
    });
  });

  describe("valid transitions from RETRYING", () => {
    it("RETRYING → RETRYING is allowed", () => {
      expect(canTransition(EventStatus.RETRYING, EventStatus.RETRYING)).toBe(
        true
      );
    });

    it("RETRYING → DELIVERED is allowed", () => {
      expect(canTransition(EventStatus.RETRYING, EventStatus.DELIVERED)).toBe(
        true
      );
    });

    it("RETRYING → FAILED is allowed", () => {
      expect(canTransition(EventStatus.RETRYING, EventStatus.FAILED)).toBe(
        true
      );
    });
  });

  describe("invalid transitions from PENDING", () => {
    it("PENDING → PENDING is not allowed (no self-loop)", () => {
      expect(canTransition(EventStatus.PENDING, EventStatus.PENDING)).toBe(
        false
      );
    });
  });

  describe("terminal state: DELIVERED", () => {
    it("DELIVERED → PENDING is not allowed", () => {
      expect(canTransition(EventStatus.DELIVERED, EventStatus.PENDING)).toBe(
        false
      );
    });

    it("DELIVERED → RETRYING is not allowed", () => {
      expect(canTransition(EventStatus.DELIVERED, EventStatus.RETRYING)).toBe(
        false
      );
    });

    it("DELIVERED → DELIVERED is not allowed", () => {
      expect(canTransition(EventStatus.DELIVERED, EventStatus.DELIVERED)).toBe(
        false
      );
    });

    it("DELIVERED → FAILED is not allowed", () => {
      expect(canTransition(EventStatus.DELIVERED, EventStatus.FAILED)).toBe(
        false
      );
    });
  });

  describe("terminal state: FAILED", () => {
    it("FAILED → PENDING is not allowed", () => {
      expect(canTransition(EventStatus.FAILED, EventStatus.PENDING)).toBe(
        false
      );
    });

    it("FAILED → RETRYING is not allowed", () => {
      expect(canTransition(EventStatus.FAILED, EventStatus.RETRYING)).toBe(
        false
      );
    });

    it("FAILED → DELIVERED is not allowed", () => {
      expect(canTransition(EventStatus.FAILED, EventStatus.DELIVERED)).toBe(
        false
      );
    });

    it("FAILED → FAILED is not allowed", () => {
      expect(canTransition(EventStatus.FAILED, EventStatus.FAILED)).toBe(false);
    });
  });
});
