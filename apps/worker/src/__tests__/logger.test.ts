/**
 * Unit tests for Pino logger configuration
 */

import { describe, it, expect } from "vitest";
import { createLogger } from "../logger.js";
import type { Env } from "../env.js";
import Stream from "stream";

describe("createLogger", () => {
  const mockEnv: Env = {
    DATABASE_URL: "postgresql://test",
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
    NODE_ENV: "test",
    LOG_LEVEL: "info",
    SHUTDOWN_TIMEOUT_MS: 30000,
  };

  it("should create a logger with all required methods", () => {
    const logger = createLogger(mockEnv);
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.debug).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("should configure logger with correct log level", () => {
    const warnLogger = createLogger({ ...mockEnv, LOG_LEVEL: "warn" });
    expect(warnLogger.level).toBe("warn");

    const infoLogger = createLogger({ ...mockEnv, LOG_LEVEL: "info" });
    expect(infoLogger.level).toBe("info");

    const debugLogger = createLogger({ ...mockEnv, LOG_LEVEL: "debug" });
    expect(debugLogger.level).toBe("debug");
  });

  it("should use pino-pretty transport in development mode", () => {
    const devLogger = createLogger({ ...mockEnv, NODE_ENV: "development" });
    expect(devLogger).toBeDefined();
    // Logger should be created without throwing
    expect(() => devLogger.info("test")).not.toThrow();
  });

  it("should not use pretty transport in production mode", () => {
    const prodLogger = createLogger({ ...mockEnv, NODE_ENV: "production" });
    expect(prodLogger).toBeDefined();
    // Logger should be created without throwing
    expect(() => prodLogger.info("test")).not.toThrow();
  });

  it("should include service field in base context", () => {
    const logger = createLogger(mockEnv);
    // Pino's bindings() method returns the base context
    const bindings = logger.bindings();
    expect(bindings.service).toBe("worker");
  });

  it("should redact signingSecret fields from logged objects", () => {
    // Create a writable stream to capture the log output
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs: any[] = [];
    const stream = new Stream.Writable({
      write(chunk: Buffer, _encoding, callback) {
        logs.push(JSON.parse(chunk.toString()));
        callback();
      },
    });

    const prodLogger = createLogger(
      { ...mockEnv, NODE_ENV: "production" },
      stream
    );

    // Log an object containing signingSecret
    const endpoint = {
      id: "endpoint-123",
      url: "https://example.com/webhook",
      signingSecret: "super-secret-key",
    };

    prodLogger.info({ endpoint }, "test message");

    // Verify the output doesn't contain the secret
    const logOutput = JSON.stringify(logs);
    expect(logOutput).not.toContain("super-secret-key");
    expect(logs[0].endpoint.id).toBe("endpoint-123");
    expect(logs[0].endpoint.signingSecret).toBeUndefined();
  });
});
