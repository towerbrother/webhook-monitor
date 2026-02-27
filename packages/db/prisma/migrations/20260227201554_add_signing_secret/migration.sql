-- AlterTable
ALTER TABLE "WebhookEndpoint" ADD COLUMN     "signingSecret" TEXT;
-- Rollback: ALTER TABLE WebhookEndpoint DROP COLUMN signingSecret 
