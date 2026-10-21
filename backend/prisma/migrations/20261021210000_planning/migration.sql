CREATE TABLE "PlanningBoard" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "document" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanningBoard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanningBoard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlanningBoard_companyId_key" ON "PlanningBoard"("companyId");
CREATE UNIQUE INDEX "PlanningBoard_id_companyId_key" ON "PlanningBoard"("id", "companyId");
CREATE TABLE "PlanningComment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanningComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanningComment_boardId_companyId_fkey" FOREIGN KEY ("boardId", "companyId") REFERENCES "PlanningBoard"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlanningComment_authorId_companyId_fkey" FOREIGN KEY ("authorId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlanningComment_companyId_authorId_requestKey_key" ON "PlanningComment"("companyId", "authorId", "requestKey");
CREATE INDEX "PlanningComment_companyId_createdAt_id_idx" ON "PlanningComment"("companyId", "createdAt", "id");
