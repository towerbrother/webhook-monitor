-- AlterTable
ALTER TABLE "Project" ADD COLUMN "projectKey" TEXT;

-- Update existing projects with a generated key (using random UUID for now)
UPDATE "Project" SET "projectKey" = 'pk_' || replace(gen_random_uuid()::text, '-', '') WHERE "projectKey" IS NULL;

-- Make column required
ALTER TABLE "Project" ALTER COLUMN "projectKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectKey_key" ON "Project"("projectKey");
