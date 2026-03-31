/**
 * Test setup file that loads environment variables before running tests
 */

// Use test database URL if DATABASE_URL is not already set
// When running via turbo, the db package's pretest script sets up webhook_monitor_test
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/webhook_monitor_test?schema=public";

// Set LOG_LEVEL to silent for tests
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

// Redis config for tests
process.env.REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
process.env.REDIS_PORT = process.env.REDIS_PORT ?? "6379";
