ALTER TYPE "IntegrationPermission" ADD VALUE 'PROJECT_CREATE';

CREATE TABLE "IntegrationProjectCreateOperation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "integrationAccessKeyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationProjectCreateOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationProjectCreateOperation_projectId_key" ON "IntegrationProjectCreateOperation"("projectId");
CREATE UNIQUE INDEX "IntegrationProjectCreateOperation_integrationAccessKeyId_idempotencyKey_key" ON "IntegrationProjectCreateOperation"("integrationAccessKeyId", "idempotencyKey");
CREATE INDEX "IntegrationProjectCreateOperation_companyId_createdAt_idx" ON "IntegrationProjectCreateOperation"("companyId", "createdAt");

ALTER TABLE "IntegrationProjectCreateOperation" ADD CONSTRAINT "IntegrationProjectCreateOperation_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationProjectCreateOperation" ADD CONSTRAINT "IntegrationProjectCreateOperation_integrationAccessKeyId_fkey"
FOREIGN KEY ("integrationAccessKeyId") REFERENCES "IntegrationAccessKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationProjectCreateOperation" ADD CONSTRAINT "IntegrationProjectCreateOperation_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
