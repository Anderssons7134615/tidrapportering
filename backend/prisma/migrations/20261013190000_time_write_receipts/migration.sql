-- Additive migration. Never deletes or changes reported hours or approvals.
ALTER TABLE "TimeEntry" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_revision_positive" CHECK ("revision" > 0);

CREATE TABLE "TimeEntryWriteRequest" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "resultIds" TEXT[] NOT NULL,
  "revision" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeEntryWriteRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimeEntryWriteRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TimeEntryWriteRequest_actorUserId_companyId_fkey" FOREIGN KEY ("actorUserId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TimeEntryWriteRequest_operation_valid" CHECK ("operation" IN ('CREATE','UPDATE','DELETE','WEEK_VACATION')),
  CONSTRAINT "TimeEntryWriteRequest_result_nonempty" CHECK (cardinality("resultIds") > 0),
  CONSTRAINT "TimeEntryWriteRequest_revision_positive" CHECK ("revision" IS NULL OR "revision" > 0)
);
CREATE UNIQUE INDEX "TimeEntryWriteRequest_companyId_actorUserId_requestKey_key"
  ON "TimeEntryWriteRequest"("companyId", "actorUserId", "requestKey");

-- Preserve existing v2 offline request identities and their ORIGINAL hashes.
-- Rows already deleted before this migration cannot be reconstructed.
INSERT INTO "TimeEntryWriteRequest" ("id", "companyId", "actorUserId", "requestKey", "operation", "payloadHash", "resultIds", "revision", "createdAt")
SELECT 'legacy-offline-' || t."id", actor."companyId", actor."id", t."offlineLocalId", 'CREATE', t."offlinePayloadHash", ARRAY[t."id"], t."revision", t."createdAt"
FROM "TimeEntry" t
JOIN "User" actor ON actor."id" = t."offlineActorUserId"
JOIN "User" owner ON owner."id" = t."userId" AND owner."companyId" = actor."companyId"
WHERE t."offlineLocalId" IS NOT NULL AND t."offlinePayloadHash" IS NOT NULL;

CREATE FUNCTION "protectTimeEntryWriteRequest"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Time entry write receipts are immutable';
END;
$$;
CREATE TRIGGER "TimeEntryWriteRequest_immutable"
  BEFORE UPDATE OR DELETE ON "TimeEntryWriteRequest"
  FOR EACH ROW EXECUTE FUNCTION "protectTimeEntryWriteRequest"();
