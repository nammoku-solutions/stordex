-- Additive migration. No changes to operational Item, InventoryMovement,
-- PurchaseOrder or PurchaseOrderItem. All legacy tenant data is retained.
--
-- Historical snapshots are stored in separate tables and have no relations to
-- operational order/receipt/stock records, preventing accidental delta replay.
CREATE TYPE "MigrationArchiveState" AS ENUM ('PREPARED', 'SEALED');
CREATE TYPE "MigrationArchiveHistoryKind" AS ENUM ('RECONCILED_LEDGER', 'CUTOVER_ONLY_NO_HISTORY');

CREATE TABLE "MigrationArchiveBatch" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "manifestId" TEXT NOT NULL,
  "sourceTenantFingerprint" TEXT NOT NULL,
  "itemsCsvSha256" TEXT NOT NULL,
  "movementsCsvSha256" TEXT NOT NULL,
  "state" "MigrationArchiveState" NOT NULL DEFAULT 'PREPARED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sealedAt" TIMESTAMP(3),
  CONSTRAINT "MigrationArchiveBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MigrationArchiveItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "itemCode" TEXT NOT NULL,
  "cutoverStock" INTEGER NOT NULL,
  "historyKind" "MigrationArchiveHistoryKind" NOT NULL,
  "historicalOpening" INTEGER,
  "lastHistoricalBalance" INTEGER,
  "movementCount" INTEGER NOT NULL,
  CONSTRAINT "MigrationArchiveItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MigrationArchiveItem_cutoverStock_nonnegative" CHECK ("cutoverStock" >= 0),
  CONSTRAINT "MigrationArchiveItem_movementCount_nonnegative" CHECK ("movementCount" >= 0)
);

CREATE TABLE "MigrationArchivePurchaseOrder" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sourcePoNumber" TEXT NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  CONSTRAINT "MigrationArchivePurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MigrationArchiveMovement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sourceMovementId" TEXT NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  CONSTRAINT "MigrationArchiveMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MigrationArchiveBatch_tenantId_manifestId_key"
  ON "MigrationArchiveBatch"("tenantId", "manifestId");
CREATE UNIQUE INDEX "MigrationArchiveBatch_id_tenantId_key"
  ON "MigrationArchiveBatch"("id", "tenantId");
CREATE INDEX "MigrationArchiveBatch_tenantId_createdAt_idx"
  ON "MigrationArchiveBatch"("tenantId", "createdAt");
CREATE UNIQUE INDEX "MigrationArchiveItem_batchId_itemCode_key"
  ON "MigrationArchiveItem"("batchId", "itemCode");
CREATE INDEX "MigrationArchiveItem_tenantId_batchId_idx"
  ON "MigrationArchiveItem"("tenantId", "batchId");
CREATE UNIQUE INDEX "MigrationArchivePurchaseOrder_batchId_sourcePoNumber_key"
  ON "MigrationArchivePurchaseOrder"("batchId", "sourcePoNumber");
CREATE INDEX "MigrationArchivePurchaseOrder_tenantId_batchId_idx"
  ON "MigrationArchivePurchaseOrder"("tenantId", "batchId");
CREATE UNIQUE INDEX "MigrationArchiveMovement_batchId_sourceMovementId_key"
  ON "MigrationArchiveMovement"("batchId", "sourceMovementId");
CREATE INDEX "MigrationArchiveMovement_tenantId_batchId_idx"
  ON "MigrationArchiveMovement"("tenantId", "batchId");

ALTER TABLE "MigrationArchiveBatch" ADD CONSTRAINT "MigrationArchiveBatch_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationArchiveItem" ADD CONSTRAINT "MigrationArchiveItem_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationArchiveItem" ADD CONSTRAINT "MigrationArchiveItem_batchId_tenantId_fkey"
  FOREIGN KEY ("batchId", "tenantId") REFERENCES "MigrationArchiveBatch"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationArchivePurchaseOrder" ADD CONSTRAINT "MigrationArchivePurchaseOrder_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationArchivePurchaseOrder" ADD CONSTRAINT "MigrationArchivePurchaseOrder_batchId_tenantId_fkey"
  FOREIGN KEY ("batchId", "tenantId") REFERENCES "MigrationArchiveBatch"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationArchiveMovement" ADD CONSTRAINT "MigrationArchiveMovement_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationArchiveMovement" ADD CONSTRAINT "MigrationArchiveMovement_batchId_tenantId_fkey"
  FOREIGN KEY ("batchId", "tenantId") REFERENCES "MigrationArchiveBatch"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Batch source identity is immutable. Only an explicitly timestamped
-- one-way PREPARED -> SEALED state transition is allowed.
CREATE FUNCTION stordex_guard_migration_archive_batch()
RETURNS trigger LANGUAGE plpgsql AS $archive_guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Historical migration archive batches cannot be deleted';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."manifestId" IS DISTINCT FROM OLD."manifestId"
     OR NEW."sourceTenantFingerprint" IS DISTINCT FROM OLD."sourceTenantFingerprint"
     OR NEW."itemsCsvSha256" IS DISTINCT FROM OLD."itemsCsvSha256"
     OR NEW."movementsCsvSha256" IS DISTINCT FROM OLD."movementsCsvSha256"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Historical migration archive batch identity is immutable';
  END IF;
  IF OLD."state" = 'PREPARED' AND NEW."state" = 'SEALED'
     AND OLD."sealedAt" IS NULL AND NEW."sealedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."state" = OLD."state"
     AND NEW."sealedAt" IS NOT DISTINCT FROM OLD."sealedAt" THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid migration archive state transition';
END;
$archive_guard$;

CREATE TRIGGER "MigrationArchiveBatch_state_guard"
  BEFORE UPDATE OR DELETE ON "MigrationArchiveBatch"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_migration_archive_batch();

-- Protect the audit payload at the DB level, including against a future
-- accidental Prisma update/delete. Retention/erasure policy must be reviewed
-- before this feature is enabled on any customer environment.
CREATE FUNCTION stordex_block_migration_archive_edit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Historical migration archive snapshots are immutable';
END;
$$;

CREATE TRIGGER "MigrationArchiveItem_immutable"
  BEFORE UPDATE OR DELETE ON "MigrationArchiveItem"
  FOR EACH ROW EXECUTE FUNCTION stordex_block_migration_archive_edit();

CREATE TRIGGER "MigrationArchivePurchaseOrder_immutable"
  BEFORE UPDATE OR DELETE ON "MigrationArchivePurchaseOrder"
  FOR EACH ROW EXECUTE FUNCTION stordex_block_migration_archive_edit();

CREATE TRIGGER "MigrationArchiveMovement_immutable"
  BEFORE UPDATE OR DELETE ON "MigrationArchiveMovement"
  FOR EACH ROW EXECUTE FUNCTION stordex_block_migration_archive_edit();
