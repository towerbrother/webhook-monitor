/**
 * Domain function tests for @repo/db
 *
 * These tests verify application-level invariants that cannot be enforced
 * at the database level alone.
 */

import { describe, it, expect } from "vitest";
import { validateEventProjectScope } from "../domain.js";

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
