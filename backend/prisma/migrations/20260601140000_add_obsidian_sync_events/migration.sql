CREATE TABLE IF NOT EXISTS "ObsidianSyncEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "ackedAt" TIMESTAMP(3),
    "ackedBy" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObsidianSyncEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ObsidianSyncEvent_companyId_createdAt_idx" ON "ObsidianSyncEvent"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "ObsidianSyncEvent_companyId_ackedAt_createdAt_idx" ON "ObsidianSyncEvent"("companyId", "ackedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "ObsidianSyncEvent_projectId_idx" ON "ObsidianSyncEvent"("projectId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ObsidianSyncEvent_companyId_fkey'
    ) THEN
        ALTER TABLE "ObsidianSyncEvent"
        ADD CONSTRAINT "ObsidianSyncEvent_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
