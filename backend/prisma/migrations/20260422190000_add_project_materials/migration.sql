-- CreateTable
CREATE TABLE "MaterialArticle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "articleNumber" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'st',
    "defaultUnitPrice" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMaterial" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "articleName" TEXT NOT NULL,
    "articleNumber" TEXT,
    "unit" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialArticle_companyId_active_idx" ON "MaterialArticle"("companyId", "active");

-- CreateIndex
CREATE INDEX "ProjectMaterial_projectId_date_idx" ON "ProjectMaterial"("projectId", "date");

-- CreateIndex
CREATE INDEX "ProjectMaterial_createdByUserId_idx" ON "ProjectMaterial"("createdByUserId");

-- AddForeignKey
ALTER TABLE "MaterialArticle" ADD CONSTRAINT "MaterialArticle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterial" ADD CONSTRAINT "ProjectMaterial_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterial" ADD CONSTRAINT "ProjectMaterial_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "MaterialArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterial" ADD CONSTRAINT "ProjectMaterial_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
