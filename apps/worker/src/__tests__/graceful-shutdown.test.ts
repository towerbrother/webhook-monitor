import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Worker } from "@repo/queue";
import type { PrismaClient } from "@repo/db";
import { createShutdownHandler } from "../shutdown.js";
import type { Logger } from "../logger.js";

function createMockLogger(): Logger {
  return {
    level: "info",
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: vi.fn(),
    bindings: vi.fn(() => ({})),
    flush: vi.fn(),
    isLevelEnabled: vi.fn(() => true),
    levelVal: 30,
    setBindings: vi.fn(),
    onChild: vi.fn(),
  } as unknown as Logger;
}

describe("createShutdownHandler", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.useRealTimers();
  });

  it("logs shutdown initiated with signal name at info level", async () => {
    const mockWorker = { close: vi.fn().mockResolvedValue(undefined) };
    const mockPrisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    const logger = createMockLogger();

    const handler = createShutdownHandler(
      mockWorker as unknown as Worker,
      mockPrisma as unknown as PrismaClient,
      logger,
      30000
    );
    await handler("SIGTERM");

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ signal: "SIGTERM" }),
      expect.any(String)
    );
  });

  it("calls worker.close() before prisma.$disconnect()", async () => {
    const callOrder: string[] = [];
    const mockWorker = {
      close: vi.fn().mockImplementation(async () => {
        callOrder.push("worker.close");
      }),
    };
    const mockPrisma = {
      $disconnect: vi.fn().mockImplementation(async () => {
        callOrder.push("prisma.$disconnect");
      }),
    };
    const logger = createMockLogger();

    const handler = createShutdownHandler(
      mockWorker as unknown as Worker,
      mockPrisma as unknown as PrismaClient,
      logger,
      30000
    );
    await handler("SIGINT");

    expect(callOrder).toEqual(["worker.close", "prisma.$disconnect"]);
  });

  it("calls process.exit(0) after successful shutdown", async () => {
    const mockWorker = { close: vi.fn().mockResolvedValue(undefined) };
    const mockPrisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    const logger = createMockLogger();

    const handler = createShutdownHandler(
      mockWorker as unknown as Worker,
      mockPrisma as unknown as PrismaClient,
      logger,
      30000
    );
    await handler("SIGTERM");

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("waits for in-flight jobs to complete before exiting", async () => {
    const callOrder: string[] = [];
    let resolveWorkerClose!: () => void;
    const workerClosePromise = new Promise<void>((resolve) => {
      resolveWorkerClose = resolve;
    });

    const mockWorker = {
      close: vi.fn().mockImplementation(async () => {
        callOrder.push("worker.close:start");
        await workerClosePromise;
        callOrder.push("worker.close:end");
      }),
    };
    const mockPrisma = {
      $disconnect: vi.fn().mockImplementation(async () => {
        callOrder.push("prisma.$disconnect");
      }),
    };
    exitSpy.mockImplementation((code?: number) => {
      callOrder.push(`process.exit(${code})`);
      return undefined as never;
    });

    const handler = createShutdownHandler(
      mockWorker as unknown as Worker,
      mockPrisma as unknown as PrismaClient,
      createMockLogger(),
      30000
    );

    const shutdownPromise = handler("SIGTERM");

    // worker.close started but not yet done — simulate job still in flight
    expect(callOrder).toContain("worker.close:start");
    expect(callOrder).not.toContain("worker.close:end");

    // simulate in-flight job completing
    resolveWorkerClose();
    await shutdownPromise;

    expect(callOrder).toEqual([
      "worker.close:start",
      "worker.close:end",
      "prisma.$disconnect",
      "process.exit(0)",
    ]);
  });

  it("force-exits with code 1 when SHUTDOWN_TIMEOUT_MS is exceeded", async () => {
    vi.useFakeTimers();

    const mockWorker = {
      close: vi.fn().mockReturnValue(new Promise<void>(() => {})), // never resolves
    };
    const mockPrisma = { $disconnect: vi.fn() };
    const logger = createMockLogger();

    const handler = createShutdownHandler(
      mockWorker as unknown as Worker,
      mockPrisma as unknown as PrismaClient,
      logger,
      1000
    );

    const shutdownPromise = handler("SIGTERM");
    await vi.runAllTimersAsync();
    await shutdownPromise;

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("logs an error when shutdown timeout is exceeded", async () => {
    vi.useFakeTimers();

    const mockWorker = {
      close: vi.fn().mockReturnValue(new Promise<void>(() => {})),
    };
    const mockPrisma = { $disconnect: vi.fn() };
    const logger = createMockLogger();

    const handler = createShutdownHandler(
      mockWorker as unknown as Worker,
      mockPrisma as unknown as PrismaClient,
      logger,
      1000
    );

    const shutdownPromise = handler("SIGTERM");
    await vi.runAllTimersAsync();
    await shutdownPromise;

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ signal: "SIGTERM" }),
      expect.stringContaining("timeout")
    );
  });

  it("handles SIGTERM and SIGINT both correctly", async () => {
    for (const signal of ["SIGTERM", "SIGINT"]) {
      const mockWorker = { close: vi.fn().mockResolvedValue(undefined) };
      const mockPrisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
      const logger = createMockLogger();

      const handler = createShutdownHandler(
        mockWorker as unknown as Worker,
        mockPrisma as unknown as PrismaClient,
        logger,
        30000
      );
      await handler(signal);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ signal }),
        expect.any(String)
      );
      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockClear();
    }
  });
});
