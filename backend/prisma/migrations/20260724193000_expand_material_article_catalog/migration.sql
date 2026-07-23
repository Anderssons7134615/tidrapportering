ALTER TABLE "MaterialArticle"
  ADD COLUMN "supplier" TEXT,
  ADD COLUMN "manufacturer" TEXT,
  ADD COLUMN "originalDescription" TEXT,
  ADD COLUMN "productFamily" TEXT,
  ADD COLUMN "pipeDimensionMm" DOUBLE PRECISION,
  ADD COLUMN "insulationThicknessMm" DOUBLE PRECISION,
  ADD COLUMN "outerDiameterMm" DOUBLE PRECISION,
  ADD COLUMN "listPrice" DOUBLE PRECISION,
  ADD COLUMN "discountPercent" DOUBLE PRECISION,
  ADD COLUMN "priceSource" TEXT,
  ADD COLUMN "priceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "searchTerms" TEXT,
  ADD COLUMN "employeeVisible" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "MaterialArticle_companyId_category_active_idx"
  ON "MaterialArticle"("companyId", "category", "active");

CREATE INDEX "MaterialArticle_companyId_articleNumber_idx"
  ON "MaterialArticle"("companyId", "articleNumber");
