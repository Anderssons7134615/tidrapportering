CREATE TYPE "IntegrationPermission" AS ENUM ('READ_ONLY', 'MATERIAL_CREATE');

ALTER TABLE "IntegrationAccessKey"
ADD COLUMN "permission" "IntegrationPermission" NOT NULL DEFAULT 'READ_ONLY';

CREATE TABLE "IntegrationProjectAccess" (
    "integrationAccessKeyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationProjectAccess_pkey" PRIMARY KEY ("integrationAccessKeyId", "projectId")
);

CREATE TABLE "IntegrationMaterialOperation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "integrationAccessKeyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "rowCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationMaterialOperation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProjectMaterial"
ADD COLUMN "integrationOperationId" TEXT,
ADD COLUMN "integrationRowIndex" INTEGER;

CREATE INDEX "IntegrationProjectAccess_projectId_idx" ON "IntegrationProjectAccess"("projectId");
CREATE UNIQUE INDEX "IntegrationMaterialOperation_integrationAccessKeyId_idempotencyKey_key"
ON "IntegrationMaterialOperation"("integrationAccessKeyId", "idempotencyKey");
CREATE INDEX "IntegrationMaterialOperation_companyId_createdAt_idx"
ON "IntegrationMaterialOperation"("companyId", "createdAt");
CREATE INDEX "IntegrationMaterialOperation_projectId_createdAt_idx"
ON "IntegrationMaterialOperation"("projectId", "createdAt");
CREATE INDEX "ProjectMaterial_integrationOperationId_idx" ON "ProjectMaterial"("integrationOperationId");
CREATE UNIQUE INDEX "ProjectMaterial_integrationOperationId_integrationRowIndex_key"
ON "ProjectMaterial"("integrationOperationId", "integrationRowIndex");

ALTER TABLE "IntegrationProjectAccess"
ADD CONSTRAINT "IntegrationProjectAccess_integrationAccessKeyId_fkey"
FOREIGN KEY ("integrationAccessKeyId") REFERENCES "IntegrationAccessKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationProjectAccess"
ADD CONSTRAINT "IntegrationProjectAccess_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationMaterialOperation"
ADD CONSTRAINT "IntegrationMaterialOperation_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationMaterialOperation"
ADD CONSTRAINT "IntegrationMaterialOperation_integrationAccessKeyId_fkey"
FOREIGN KEY ("integrationAccessKeyId") REFERENCES "IntegrationAccessKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationMaterialOperation"
ADD CONSTRAINT "IntegrationMaterialOperation_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectMaterial"
ADD CONSTRAINT "ProjectMaterial_integrationOperationId_fkey"
FOREIGN KEY ("integrationOperationId") REFERENCES "IntegrationMaterialOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
