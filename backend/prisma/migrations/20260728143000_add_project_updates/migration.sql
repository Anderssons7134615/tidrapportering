CREATE TABLE "ProjectUpdate" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'TIDAPP',
  "createdByUserId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectUpdate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectUpdate_companyId_source_idempotencyKey_key"
  ON "ProjectUpdate"("companyId", "source", "idempotencyKey");

CREATE INDEX "ProjectUpdate_companyId_projectId_occurredAt_idx"
  ON "ProjectUpdate"("companyId", "projectId", "occurredAt");

CREATE INDEX "ProjectUpdate_projectId_createdAt_idx"
  ON "ProjectUpdate"("projectId", "createdAt");

ALTER TABLE "ProjectUpdate"
  ADD CONSTRAINT "ProjectUpdate_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectUpdate"
  ADD CONSTRAINT "ProjectUpdate_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectUpdate"
  ADD CONSTRAINT "ProjectUpdate_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
