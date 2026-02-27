import { describe, it, expect } from "vitest";
import { toWebhookEndpointDTO } from "../dto.js";

describe("WebhookEndpoint DTO", () => {
  it("should exclude signingSecret from DTO", () => {
    const endpoint = {
      id: "test-id",
      projectId: "test-project",
      url: "https://example.com",
      signingSecret: "secret-value",
      createdAt: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const dto = toWebhookEndpointDTO(endpoint);

    expect(dto).not.toHaveProperty("signingSecret");
    expect(dto.id).toBe(endpoint.id);
    expect(dto.url).toBe(endpoint.url);
  });
});
