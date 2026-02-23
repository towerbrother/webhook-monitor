-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'RETRYING', 'DELIVERED', 'FAILED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "status" "EventStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryAttempt_eventId_idx" ON "DeliveryAttempt"("eventId");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_projectId_eventId_idx" ON "DeliveryAttempt"("projectId", "eventId");

-- CreateIndex
CREATE INDEX "Event_projectId_status_idx" ON "Event"("projectId", "status");

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
