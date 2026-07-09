-- Preserve historical material rows when their creating user is removed.
ALTER TABLE "ProjectMaterial" DROP CONSTRAINT "ProjectMaterial_createdByUserId_fkey";
ALTER TABLE "ProjectMaterial" ALTER COLUMN "createdByUserId" DROP NOT NULL;
ALTER TABLE "ProjectMaterial" ADD CONSTRAINT "ProjectMaterial_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
