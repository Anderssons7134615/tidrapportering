-- CreateEnum
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'VOID');

-- CreateEnum
CREATE TYPE "SupplierInvoiceType" AS ENUM ('INVOICE', 'CREDIT');

-- CreateTable
CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "documentType" "SupplierInvoiceType" NOT NULL DEFAULT 'INVOICE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'PDF',
    "supplierName" TEXT,
    "supplierOrgNumber" TEXT,
    "supplierKey" TEXT,
    "invoiceNumber" TEXT,
    "numberKey" TEXT,
    "issueDate" DATE,
    "dueDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "netOre" INTEGER,
    "vatOre" INTEGER,
    "roundingOre" INTEGER NOT NULL DEFAULT 0,
    "grossOre" INTEGER,
    "note" TEXT,
    "suggestions" JSONB,
    "parseWarnings" JSONB,
    "parserVersion" TEXT,
    "statusReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierInvoiceDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierInvoiceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierInvoiceAllocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "netOre" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierInvoiceAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierInvoice_companyId_status_createdAt_idx" ON "SupplierInvoice"("companyId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvoice_id_companyId_key" ON "SupplierInvoice"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvoice_identity_key" ON "SupplierInvoice"("companyId", "supplierKey", "numberKey", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvoiceDocument_invoiceId_companyId_key" ON "SupplierInvoiceDocument"("invoiceId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvoiceDocument_companyId_sha256_key" ON "SupplierInvoiceDocument"("companyId", "sha256");

-- CreateIndex
CREATE INDEX "SupplierInvoiceAllocation_companyId_projectId_idx" ON "SupplierInvoiceAllocation"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvoiceAllocation_invoiceId_projectId_key" ON "SupplierInvoiceAllocation"("invoiceId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_id_companyId_key" ON "Project"("id", "companyId");
CREATE UNIQUE INDEX "User_id_companyId_key" ON "User"("id", "companyId");

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_createdByUserId_companyId_fkey" FOREIGN KEY ("createdByUserId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_confirmedByUserId_companyId_fkey" FOREIGN KEY ("confirmedByUserId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoiceDocument" ADD CONSTRAINT "SupplierInvoiceDocument_invoiceId_companyId_fkey" FOREIGN KEY ("invoiceId", "companyId") REFERENCES "SupplierInvoice"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoiceAllocation" ADD CONSTRAINT "SupplierInvoiceAllocation_invoiceId_companyId_fkey" FOREIGN KEY ("invoiceId", "companyId") REFERENCES "SupplierInvoice"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoiceAllocation" ADD CONSTRAINT "SupplierInvoiceAllocation_projectId_companyId_fkey" FOREIGN KEY ("projectId", "companyId") REFERENCES "Project"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- New tables only. Drafts may be incomplete; confirmed records may not.
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_currency_check" CHECK ("currency" = 'SEK');
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_revision_check" CHECK ("revision" > 0);
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_void_identity_check" CHECK ("status" <> 'VOID' OR ("supplierKey" IS NULL AND "numberKey" IS NULL));
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_rounding_check" CHECK ("roundingOre" BETWEEN -100 AND 100);
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_sign_check" CHECK (
  ("documentType" = 'INVOICE' AND COALESCE("netOre", 0) >= 0 AND COALESCE("vatOre", 0) >= 0 AND COALESCE("grossOre", 0) >= 0)
  OR ("documentType" = 'CREDIT' AND COALESCE("netOre", 0) <= 0 AND COALESCE("vatOre", 0) <= 0 AND COALESCE("grossOre", 0) <= 0)
);
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_confirmation_check" CHECK (
  "status" <> 'CONFIRMED' OR (
    NULLIF(TRIM("supplierName"), '') IS NOT NULL AND "supplierKey" IS NOT NULL
    AND NULLIF(TRIM("invoiceNumber"), '') IS NOT NULL AND "numberKey" IS NOT NULL AND "issueDate" IS NOT NULL
    AND "netOre" IS NOT NULL AND "vatOre" IS NOT NULL AND "grossOre" IS NOT NULL
    AND "netOre"::BIGINT + "vatOre"::BIGINT + "roundingOre" = "grossOre"
    AND "confirmedByUserId" IS NOT NULL AND "confirmedAt" IS NOT NULL
  )
);
ALTER TABLE "SupplierInvoiceDocument" ADD CONSTRAINT "SupplierInvoiceDocument_content_check" CHECK (
  "byteSize" = octet_length("content") AND "byteSize" BETWEEN 5 AND 10485760
  AND "mimeType" = 'application/pdf' AND substring("content" FROM 1 FOR 5) = decode('255044462d', 'hex')
  AND "sha256" ~ '^[a-f0-9]{64}$'
);
