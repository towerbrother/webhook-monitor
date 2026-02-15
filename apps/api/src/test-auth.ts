/**
 * Test script for project authentication
 *
 * This script:
 * 1. Creates a test project with a project key
 * 2. Creates a test webhook endpoint for that project
 * 3. Tests authentication scenarios
 *
 * Run with: pnpm tsx apps/api/src/test-auth.ts
 */

import { createPrismaClient } from "@repo/db";

async function main() {
  const prisma = createPrismaClient({ logQueries: false });
  await prisma.$connect();

  try {
    console.log("🧪 Testing Project Authentication\n");

    // Clean up any existing test data
    await prisma.event.deleteMany({
      where: { project: { name: "Test Project" } },
    });
    await prisma.webhookEndpoint.deleteMany({
      where: { project: { name: "Test Project" } },
    });
    await prisma.project.deleteMany({
      where: { name: "Test Project" },
    });

    // Create test project with a known project key
    const projectKey = "pk_test_" + Math.random().toString(36).substring(2, 15);
    const project = await prisma.project.create({
      data: {
        name: "Test Project",
        projectKey,
      },
    });

    console.log("✅ Created test project:");
    console.log(`   - ID: ${project.id}`);
    console.log(`   - Name: ${project.name}`);
    console.log(`   - Key: ${project.projectKey}\n`);

    // Create test webhook endpoint
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        name: "Test Endpoint",
        url: "test-endpoint-" + Math.random().toString(36).substring(2, 10),
        projectId: project.id,
      },
    });

    console.log("✅ Created test webhook endpoint:");
    console.log(`   - ID: ${endpoint.id}`);
    console.log(`   - Name: ${endpoint.name}`);
    console.log(`   - URL: ${endpoint.url}\n`);

    console.log("📋 Test Instructions:");
    console.log("   Start the API server with: pnpm --filter @repo/api dev\n");

    console.log("   Test 1 - Missing header (should return 401):");
    console.log(
      `   curl -X POST http://localhost:3000/webhooks/${endpoint.id}\n`
    );

    console.log("   Test 2 - Invalid key (should return 403):");
    console.log(
      `   curl -X POST http://localhost:3000/webhooks/${endpoint.id} \\`
    );
    console.log(`        -H "X-Project-Key: invalid_key"\n`);

    console.log("   Test 3 - Valid key (should return 201):");
    console.log(
      `   curl -X POST http://localhost:3000/webhooks/${endpoint.id} \\`
    );
    console.log(`        -H "X-Project-Key: ${project.projectKey}" \\`);
    console.log(`        -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"test": "data"}'\n`);

    console.log("   Test 4 - Project-wide webhook (should return 200):");
    console.log(`   curl -X POST http://localhost:3000/webhooks \\`);
    console.log(`        -H "X-Project-Key: ${project.projectKey}" \\`);
    console.log(`        -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"test": "data"}'\n`);

    console.log("🧹 Cleanup:");
    console.log(
      "   To remove test data, run this script again or manually delete the project.\n"
    );
  } catch (e) {
    console.error("❌ Error:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
