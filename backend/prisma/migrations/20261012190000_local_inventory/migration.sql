-- Additive migration only: no article import, seed, balance or existing-data writes.
CREATE UNIQUE INDEX "MaterialArticle_id_companyId_key" ON "MaterialArticle"("id", "companyId");

CREATE TABLE "InventoryItem" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "shelf" TEXT NOT NULL DEFAULT '',
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryItem_articleId_companyId_fkey" FOREIGN KEY ("articleId", "companyId") REFERENCES "MaterialArticle"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryItem_articleId_key" ON "InventoryItem"("articleId");
CREATE UNIQUE INDEX "InventoryItem_articleId_companyId_key" ON "InventoryItem"("articleId", "companyId");
CREATE UNIQUE INDEX "InventoryItem_id_companyId_key" ON "InventoryItem"("id", "companyId");

CREATE TABLE "InventoryMovement" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "deltaMilli" INTEGER NOT NULL,
  "balanceAfterMilli" INTEGER NOT NULL CHECK ("balanceAfterMilli" BETWEEN 0 AND 1000000000),
  "articleName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT NOT NULL,
  "projectId" TEXT,
  "sourceIssueId" TEXT,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  CONSTRAINT "InventoryMovement_kind_check" CHECK (
    ("kind" = 'RECEIPT' AND "deltaMilli" > 0 AND "projectId" IS NULL AND "sourceIssueId" IS NULL) OR
    ("kind" = 'COUNT' AND "projectId" IS NULL AND "sourceIssueId" IS NULL) OR
    ("kind" = 'ISSUE' AND "deltaMilli" < 0 AND "projectId" IS NOT NULL AND "sourceIssueId" IS NULL) OR
    ("kind" = 'RETURN' AND "deltaMilli" > 0 AND "projectId" IS NOT NULL AND "sourceIssueId" IS NOT NULL)
  ),
  CONSTRAINT "InventoryMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryMovement_itemId_companyId_fkey" FOREIGN KEY ("itemId", "companyId") REFERENCES "InventoryItem"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryMovement_createdByUserId_companyId_fkey" FOREIGN KEY ("createdByUserId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryMovement_projectId_companyId_fkey" FOREIGN KEY ("projectId", "companyId") REFERENCES "Project"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryMovement_companyId_requestKey_key" ON "InventoryMovement"("companyId", "requestKey");
CREATE UNIQUE INDEX "InventoryMovement_id_companyId_itemId_key" ON "InventoryMovement"("id", "companyId", "itemId");
CREATE INDEX "InventoryMovement_companyId_itemId_createdAt_idx" ON "InventoryMovement"("companyId", "itemId", "createdAt");
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_sourceIssueId_companyId_itemId_fkey"
  FOREIGN KEY ("sourceIssueId", "companyId", "itemId") REFERENCES "InventoryMovement"("id", "companyId", "itemId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMaterial" ADD COLUMN "inventoryMovementId" TEXT;
CREATE UNIQUE INDEX "ProjectMaterial_inventoryMovementId_key" ON "ProjectMaterial"("inventoryMovementId");
ALTER TABLE "ProjectMaterial" ADD CONSTRAINT "ProjectMaterial_inventoryMovementId_fkey"
  FOREIGN KEY ("inventoryMovementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "protect_inventory_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Inventory history is append-only';
END;
$$;
CREATE TRIGGER "inventory_history_immutable" BEFORE UPDATE OR DELETE ON "InventoryMovement"
  FOR EACH ROW EXECUTE FUNCTION "protect_inventory_history"();
