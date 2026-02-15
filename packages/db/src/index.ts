import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Prisma client configuration options
 */
export interface PrismaClientConfig {
  /**
   * Enable query logging (defaults to false)
   */
  logQueries?: boolean;
  /**
   * Log levels to enable
   */
  log?: Prisma.LogLevel[];
}

/**
 * Create a new Prisma client instance.
 * Apps are responsible for managing the lifecycle (connect/disconnect).
 *
 * @example
 * ```typescript
 * const prisma = createPrismaClient({ logQueries: true });
 * await prisma.$connect();
 * // ... use prisma
 * await prisma.$disconnect();
 * ```
 */
export function createPrismaClient(
  config: PrismaClientConfig = {}
): PrismaClient {
  const logLevels: Prisma.LogLevel[] =
    config.log ?? (config.logQueries ? ["query", "error", "warn"] : ["error"]);

  return new PrismaClient({
    log: logLevels,
  });
}

// Re-export Prisma types for convenience
export * from "@prisma/client";
export * from "./domain.js";
