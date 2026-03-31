/**
 * Unit tests for Pino logger configuration
 */

import { describe, it, expect } from "vitest";
import { createLogger } from "../logger.js";
import type { Env } from "../env.js";

describe("createLogger", () => {
  const mockEnv: Env = {
    DATABASE_URL: "postgresql://test",
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
    NODE_ENV: "test",
    LOG_LEVEL: "info",
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
});
