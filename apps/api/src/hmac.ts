import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify an HMAC-SHA256 webhook signature.
 *
 * The signatureHeader must be in "sha256=<hex>" format (GitHub-style).
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 * Returns false immediately on length mismatch — no timing leak.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string
): boolean {
  const expectedHex = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expected = `sha256=${expectedHex}`;

  const sigBuf = Buffer.from(signatureHeader, "utf8");
  const expBuf = Buffer.from(expected, "utf8");

  if (sigBuf.length !== expBuf.length) {
    return false;
  }

  return timingSafeEqual(sigBuf, expBuf);
}

/**
 * Compute the HMAC-SHA256 signature for a body (for use in tests / clients).
 */
export function signWebhookBody(rawBody: Buffer, secret: string): string {
  const hex = createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${hex}`;
}
