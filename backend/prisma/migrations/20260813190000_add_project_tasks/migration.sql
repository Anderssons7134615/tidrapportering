CREATE TYPE "ProjectTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

CREATE TYPE "ProjectTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'WAITING', 'DONE');

CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "assigneeId" TEXT NOT NULL,
    "priority" "ProjectTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ProjectTaskStatus" NOT NULL DEFAULT 'TODO',
    "dueDate" DATE NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectTask_companyId_archivedAt_status_dueDate_idx"
ON "ProjectTask"("companyId", "archivedAt", "status", "dueDate");

CREATE INDEX "ProjectTask_companyId_assigneeId_archivedAt_status_dueDate_idx"
ON "ProjectTask"("companyId", "assigneeId", "archivedAt", "status", "dueDate");

CREATE INDEX "ProjectTask_companyId_projectId_archivedAt_status_dueDate_idx"
ON "ProjectTask"("companyId", "projectId", "archivedAt", "status", "dueDate");

ALTER TABLE "ProjectTask"
ADD CONSTRAINT "ProjectTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectTask"
ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectTask"
ADD CONSTRAINT "ProjectTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectTask"
ADD CONSTRAINT "ProjectTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
