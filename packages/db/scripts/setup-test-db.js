#!/usr/bin/env node
/**
 * Setup script for test database
 *
 * This script:
 * 1. Checks if PostgreSQL is running
 * 2. Drops and recreates the test database to ensure a clean state
 * 3. Runs migrations on the test database
 *
 * Usage: node scripts/setup-test-db.js
 */

import { Client } from "pg";
import { execSync } from "child_process";

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = process.env.DB_PORT || "5432";
const DB_USER = process.env.DB_USER || "postgres";
const DB_PASSWORD = process.env.DB_PASSWORD || "postgres";
const DB_NAME = process.env.DB_NAME || "webhook_monitor";
const TEST_DB_NAME = process.env.TEST_DB_NAME || "webhook_monitor_test";

async function setupTestDatabase() {
  console.log("🔍 Checking PostgreSQL connection...");

  // Connect to the default postgres database to create our test database
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: "postgres", // Connect to default postgres db
  });

  try {
    await client.connect();
    console.log("✅ PostgreSQL is running");

    // Check if test database exists
    const result = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [TEST_DB_NAME]
    );

    if (result.rows.length > 0) {
      console.log(`🗑️  Dropping existing test database: ${TEST_DB_NAME}...`);
      // Terminate all connections to the database before dropping
      await client.query(
        `
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
          AND pid <> pg_backend_pid()
      `,
        [TEST_DB_NAME]
      );
      await client.query(`DROP DATABASE ${TEST_DB_NAME}`);
      console.log(`✅ Existing test database dropped`);
    }

    console.log(`📦 Creating test database: ${TEST_DB_NAME}...`);
    await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    console.log(`✅ Test database created: ${TEST_DB_NAME}`);

    await client.end();

    // Run migrations on test database
    console.log("🔄 Running migrations on test database...");
    const testDbUrl = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${TEST_DB_NAME}`;

    execSync("prisma migrate deploy", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: testDbUrl,
      },
    });

    console.log("✅ Test database setup complete!");
    console.log(`   DATABASE_URL: ${testDbUrl}`);
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      console.error("❌ Error: PostgreSQL is not running");
      console.error("   Please start PostgreSQL with: docker compose up -d");
      process.exit(1);
    } else {
      console.error("❌ Error setting up test database:", error.message);
      process.exit(1);
    }
  }
}

setupTestDatabase();
