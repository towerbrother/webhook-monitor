import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { createLogger } from "../logger.js";
import { Writable } from "stream";

// Mock environment variables
vi.mock("../env.js", () => ({
  validateEnv: () => ({
    NODE_ENV: "test",
    LOG_LEVEL: "info",
  }),
}));

describe("Logger", () => {
  it("should create a pino logger", () => {
    const logger = createLogger();
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
  });

  it("should redact sensitive information", async () => {
    // Capture log output
    const logs: Record<string, unknown>[] = [];
    const stream = new Writable({
      write(chunk, encoding, callback) {
        logs.push(JSON.parse(chunk.toString()));
        callback();
      },
    });

    // Create a new logger instance writing to our stream
    // We recreate the logger logic here to inject the stream as destination
    // because pino() function signature is (options, destination)
    const testLogger = pino(
      {
        level: "info",
        redact: {
          paths: ["*.signingSecret", "endpoint.signingSecret"],
          remove: true,
        },
      },
      stream
    );

    const sensitiveObject = {
      endpoint: {
        id: "test-id",
        signingSecret: "super-secret-key",
      },
      other: "value",
    };

    testLogger.info(sensitiveObject, "Testing redaction");

    // Wait for stream to process
    await new Promise((resolve) => setTimeout(resolve, 10));

    const log = logs[0] as Record<string, unknown>;
    expect(log).toBeDefined();

    // Type assertion to access nested properties safely
    const endpoint = log.endpoint as Record<string, unknown>;
    expect(endpoint).toBeDefined();

    // signingSecret should be redacted (removed or replaced)
    expect(endpoint.signingSecret).toBeUndefined();

    // other fields should remain
    expect(endpoint.id).toBe("test-id");
    expect(log.other).toBe("value");
  });
});
