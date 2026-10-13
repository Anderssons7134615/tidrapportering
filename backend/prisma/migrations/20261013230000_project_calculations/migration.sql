CREATE TABLE "ProjectCalculation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceRevision" INTEGER NOT NULL CHECK ("sourceRevision" > 0),
  "schemaVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("schemaVersion" = 1),
  "fingerprint" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectCalculation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectCalculation_project_scope_fkey" FOREIGN KEY ("projectId", "companyId") REFERENCES "Project"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectCalculation_creator_scope_fkey" FOREIGN KEY ("createdByUserId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProjectCalculation_companyId_sourceId_sourceRevision_key" ON "ProjectCalculation"("companyId", "sourceId", "sourceRevision");
CREATE INDEX "ProjectCalculation_companyId_projectId_createdAt_idx" ON "ProjectCalculation"("companyId", "projectId", "createdAt");

CREATE FUNCTION "protect_project_calculation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Imported calculation versions are immutable';
END;
$$;
CREATE TRIGGER "ProjectCalculation_immutable" BEFORE UPDATE OR DELETE ON "ProjectCalculation"
FOR EACH ROW EXECUTE FUNCTION "protect_project_calculation"();
