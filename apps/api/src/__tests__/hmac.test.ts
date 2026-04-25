import { describe, it, expect } from "vitest";
import { verifyWebhookSignature, signWebhookBody } from "../hmac.js";

describe("verifyWebhookSignature", () => {
  const secret = "my-webhook-secret";
  const body = Buffer.from(JSON.stringify({ event: "push", ref: "main" }));

  it("returns true for a valid signature", () => {
    const sig = signWebhookBody(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it("returns false when the body has been tampered", () => {
    const sig = signWebhookBody(body, secret);
    const tampered = Buffer.from(
      JSON.stringify({ event: "push", ref: "evil" })
    );
    expect(verifyWebhookSignature(tampered, sig, secret)).toBe(false);
  });

  it("returns false when the secret is wrong", () => {
    const sig = signWebhookBody(body, "different-secret");
    expect(verifyWebhookSignature(body, sig, secret)).toBe(false);
  });

  it("returns false when a single bit of the signature is flipped", () => {
    const sig = signWebhookBody(body, secret);
    // Flip the last hex character
    const flipped = sig.slice(0, -1) + (sig.slice(-1) === "0" ? "1" : "0");
    expect(verifyWebhookSignature(body, flipped, secret)).toBe(false);
  });

  it("returns false for empty signature header", () => {
    expect(verifyWebhookSignature(body, "", secret)).toBe(false);
  });

  it("returns false for a raw hex signature without the 'sha256=' prefix", () => {
    const sig = signWebhookBody(body, secret);
    // Strip the prefix
    const raw = sig.replace("sha256=", "");
    expect(verifyWebhookSignature(body, raw, secret)).toBe(false);
  });

  it("works correctly with an empty body", () => {
    const emptyBody = Buffer.alloc(0);
    const sig = signWebhookBody(emptyBody, secret);
    expect(verifyWebhookSignature(emptyBody, sig, secret)).toBe(true);
  });
});
