CREATE UNIQUE INDEX "ProjectCalculation_id_companyId_projectId_key" ON "ProjectCalculation"("id", "companyId", "projectId");
CREATE TABLE "ProjectCalculationDraft" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "name" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "lockedCalculationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectCalculationDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectCalculationDraft_project_scope_fkey" FOREIGN KEY ("projectId", "companyId") REFERENCES "Project"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectCalculationDraft_creator_scope_fkey" FOREIGN KEY ("createdByUserId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectCalculationDraft_locked_scope_fkey" FOREIGN KEY ("lockedCalculationId", "companyId", "projectId") REFERENCES "ProjectCalculation"("id", "companyId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProjectCalculationDraft_companyId_projectId_updatedAt_idx" ON "ProjectCalculationDraft"("companyId", "projectId", "updatedAt");
CREATE FUNCTION "protect_locked_calculation_draft"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."lockedCalculationId" IS NOT NULL THEN
    RAISE EXCEPTION 'Locked calculation drafts are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ProjectCalculationDraft_locked" BEFORE UPDATE OR DELETE ON "ProjectCalculationDraft"
FOR EACH ROW EXECUTE FUNCTION "protect_locked_calculation_draft"();
