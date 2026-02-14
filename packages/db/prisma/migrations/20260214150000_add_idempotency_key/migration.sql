-- AlterTable: Add idempotencyKey column to Event
ALTER TABLE "Event" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex: Unique constraint on (projectId, idempotencyKey)
-- This ensures idempotency keys are unique within a project (tenant isolation)
-- NULL values are allowed (events without idempotency key)
CREATE UNIQUE INDEX "Event_projectId_idempotencyKey_key" ON "Event"("projectId", "idempotencyKey");
