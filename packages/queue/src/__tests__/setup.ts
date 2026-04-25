/**
 * Test setup file that loads environment variables before running tests
 */

// Isolate tests on a separate Redis DB so a locally-running worker
// (e.g. docker compose, `pnpm dev`) on db 0 cannot consume test jobs.
process.env.REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
process.env.REDIS_PORT = process.env.REDIS_PORT ?? "6379";
process.env.REDIS_DB = process.env.REDIS_DB ?? "1";
