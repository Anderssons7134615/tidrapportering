CREATE TABLE "IntegrationAccessKey" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationAccessKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationAccessKey_keyHash_key" ON "IntegrationAccessKey"("keyHash");
CREATE INDEX "IntegrationAccessKey_companyId_active_idx" ON "IntegrationAccessKey"("companyId", "active");

ALTER TABLE "IntegrationAccessKey"
ADD CONSTRAINT "IntegrationAccessKey_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
