ALTER TABLE "Project" ADD COLUMN "fixedPrice" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "notes" TEXT;

ALTER TABLE "MaterialArticle" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Övrigt';
ALTER TABLE "MaterialArticle" ADD COLUMN "purchasePrice" DOUBLE PRECISION;
ALTER TABLE "MaterialArticle" ADD COLUMN "markupPercent" DOUBLE PRECISION;

ALTER TABLE "ProjectMaterial" ADD COLUMN "purchasePrice" DOUBLE PRECISION;
ALTER TABLE "ProjectMaterial" ADD COLUMN "invoiceStatus" TEXT NOT NULL DEFAULT 'UNINVOICED';
ALTER TABLE "ProjectMaterial" ADD COLUMN "invoicedAt" TIMESTAMP(3);
ALTER TABLE "ProjectMaterial" ADD COLUMN "invoiceReference" TEXT;

ALTER TABLE "TimeEntry" ADD COLUMN "invoiceStatus" TEXT NOT NULL DEFAULT 'UNINVOICED';
ALTER TABLE "TimeEntry" ADD COLUMN "invoicedAt" TIMESTAMP(3);
ALTER TABLE "TimeEntry" ADD COLUMN "invoiceReference" TEXT;
