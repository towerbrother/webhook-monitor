import { PrismaClient, type Prisma } from "./generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

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
  /**
   * Database connection string (optional, defaults to DATABASE_URL env var)
   */
  connectionString?: string;
  /**
   * Disable error logging (useful for tests with expected errors)
   * Defaults to false (errors are logged)
   */
  silent?: boolean;
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
    config.log ??
    (config.silent
      ? []
      : config.logQueries
        ? ["query", "error", "warn"]
        : ["error"]);

  const connectionString =
    config.connectionString ?? process.env.DATABASE_URL ?? "";

  // Prisma 7.x requires an adapter when using the client engine
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: logLevels,
  });
}

// Re-export Prisma types for convenience (except conflicting model types)
export { Prisma, PrismaClient } from "./generated/client.js";
// Export domain types which include the models
export * from "./domain.js";
