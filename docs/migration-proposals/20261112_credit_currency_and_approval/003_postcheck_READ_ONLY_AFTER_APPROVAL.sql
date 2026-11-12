-- READ ONLY POSTCHECK. Do not run until a real 12th migration has been
-- separately reviewed and explicitly authorized for the exact Staging DB.
-- Neon project stordex-staging: dry-feather-14704968
-- Neon branch staging: br-sparkling-boat-ao9nrctp
-- Neon database: neondb. Never use root branch "production".
-- Post-migration expectation: 32 tables / 12 applied, no unfinished.
-- All three new append-only ledgers are EMPTY immediately after migration.

SELECT
  current_setting('neon.project_id',true) AS neon_project_id,
  current_setting('neon.branch_id',true) AS neon_branch_id,
  current_database() AS db,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE') AS public_tables,
  (SELECT count(*) FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied_migrations,
  (SELECT count(*) FROM "_prisma_migrations"
    WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS incomplete_migrations,
  (SELECT count(*) FROM "B2BInvoiceCurrencyEvidence") AS source_evidence,
  (SELECT count(*) FROM "B2BInvoiceCurrencyEvidenceEvent") AS evidence_events,
  (SELECT count(*) FROM "B2BCreditApprovalReviewEvent") AS approval_events,
  (SELECT count(*) FROM "B2BCreditNote") AS credit_notes,
  (SELECT count(*) FROM "B2BCreditNote" WHERE status='VOID' AND
    "proposedSubtotal" IS NULL AND "proposedTax" IS NULL AND "proposedTotal" IS NULL)
      AS void_notes_without_amount,
  (SELECT count(*) FROM "B2BCreditVoidEvent") AS original_void_audits,
  (SELECT coalesce(sum(l."creditedQuantity"),0) FROM "B2BCreditNoteLine" l
    JOIN "B2BCreditNote" n ON n.id=l."creditNoteId"
    WHERE n.status<>'VOID') AS active_allocated_units,
  (SELECT count(*) FROM "Invoice"
    WHERE "invoiceNumber"='I-202611-0001' AND status='ISSUED'
      AND subtotal=4400 AND tax=440 AND total=4840) AS original_invoice,
  (SELECT count(*) FROM "InventoryMovement") AS inventory_movements,
  (SELECT stock FROM "Item" WHERE code='D-PAPER' AND
    "tenantId"=(SELECT "buyerTenantId" FROM "IntercompanyOrder"
      WHERE "poNumber"='P-20261110-0001')) AS buyer_stock,
  (SELECT stock FROM "Item" WHERE code='A-PAPER' AND
    "tenantId"=(SELECT "sellerTenantId" FROM "IntercompanyOrder"
      WHERE "poNumber"='P-20261110-0001')) AS seller_stock;

-- Six triggers are expected: 3 insert provenance guards + 3 immutability.
SELECT c.relname AS table_name,t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname IN
  ('B2BInvoiceCurrencyEvidence','B2BInvoiceCurrencyEvidenceEvent',
   'B2BCreditApprovalReviewEvent')
ORDER BY c.relname,t.tgname;

-- Existing draft/void-only restriction MUST remain; no issue/apply enabled.
SELECT c.conname AS constraint_name,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c JOIN pg_class tab ON tab.oid=c.conrelid
WHERE tab.relname='B2BCreditNote' AND c.conname IN
  ('B2BCreditNote_draft_or_void_only_check',
   'B2BCreditNote_void_metadata_check')
ORDER BY c.conname;

-- Compare unchanged 29 original tables, including all their row counts and
-- normalized content hashes, against the FRESH pre-migration snapshot.
-- Verify historical 11 migration checksum rows remain identical.
-- Verify any DDL statement expected a single transaction and no partial
-- Prisma history. Do not perform a destructive "rollback" in Staging.
