-- Preserve the origin and original payload of offline time reports. The nullable
-- columns leave regular online registrations unaffected while the unique index
-- makes replaying an offline request safe.
ALTER TABLE "TimeEntry"
  ADD COLUMN "offlineActorUserId" TEXT,
  ADD COLUMN "offlineLocalId" TEXT,
  ADD COLUMN "offlinePayloadHash" TEXT,
  ADD COLUMN "approvedHourlyCostSnapshot" DOUBLE PRECISION,
  ADD COLUMN "approvedBillingRateSnapshot" DOUBLE PRECISION,
  ADD COLUMN "financialSnapshotCapturedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "TimeEntry_offlineActorUserId_offlineLocalId_key"
  ON "TimeEntry"("offlineActorUserId", "offlineLocalId");

-- Invalidate existing JWTs when a password is changed.
ALTER TABLE "User"
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Project materials must never disappear as a side effect of deleting a project.
ALTER TABLE "ProjectMaterial" DROP CONSTRAINT "ProjectMaterial_projectId_fkey";
ALTER TABLE "ProjectMaterial"
  ADD CONSTRAINT "ProjectMaterial_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
