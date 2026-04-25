-- AlterTable: add optional signingSecret column to WebhookEndpoint
-- @sensitive - this column must never appear in API responses or logs
-- Rollback: ALTER TABLE "WebhookEndpoint" DROP COLUMN "signingSecret";
ALTER TABLE "WebhookEndpoint" ADD COLUMN "signingSecret" TEXT;
