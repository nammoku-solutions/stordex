CREATE TYPE "ImportTarget" AS ENUM ('CUSTOMER', 'SUPPLIER', 'ITEM', 'ORDER');
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'DRYRUN_OK', 'DRYRUN_FAILED', 'COMMITTED', 'FAILED');

CREATE TABLE "ImportJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "target" "ImportTarget" NOT NULL,
  "fileName" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
  "errorCsv" TEXT,
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImportJob_tenantId_createdAt_idx" ON "ImportJob"("tenantId", "createdAt");
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
