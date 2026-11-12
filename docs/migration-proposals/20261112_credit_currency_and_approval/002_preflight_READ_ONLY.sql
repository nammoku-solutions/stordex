-- READ ONLY. Run ONLY after explicitly selecting:
-- Neon project stordex-staging (dry-feather-14704968)
-- Neon branch staging (br-sparkling-boat-ao9nrctp)
-- Database neondb
-- Never use Neon root branch named production. Do not modify any data.
-- Expected baseline BEFORE proposed 12th migration: 29 tables / 11 applied.

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
  (SELECT count(*) FROM pg_tables WHERE schemaname='public'
    AND tablename IN
    ('B2BInvoiceCurrencyEvidence','B2BInvoiceCurrencyEvidenceEvent',
     'B2BCreditApprovalReviewEvent')) AS proposed_tables_already_present,
  (SELECT count(*) FROM "B2BCreditNote") AS all_credit_notes,
  (SELECT count(*) FROM "B2BCreditNote"
    WHERE status='VOID' AND "proposedSubtotal" IS NULL AND
          "proposedTax" IS NULL AND "proposedTotal" IS NULL) AS void_without_financial_amount,
  (SELECT count(*) FROM "B2BCreditVoidEvent") AS void_events,
  (SELECT coalesce(sum(line."creditedQuantity"),0)
    FROM "B2BCreditNoteLine" line
    JOIN "B2BCreditNote" note ON note.id=line."creditNoteId"
    WHERE note.status<>'VOID') AS active_credit_allocation,
  (SELECT count(*) FROM "Invoice" WHERE "invoiceNumber"='I-202611-0001'
    AND status='ISSUED' AND subtotal=4400 AND tax=440 AND total=4840) AS uat_invoice_unchanged,
  (SELECT count(*) FROM "InventoryMovement") AS inventory_movements,
  (SELECT stock FROM "Item" WHERE code='D-PAPER' AND
    "tenantId"=(SELECT "buyerTenantId" FROM "IntercompanyOrder"
      WHERE "poNumber"='P-20261110-0001')) AS buyer_stock,
  (SELECT stock FROM "Item" WHERE code='A-PAPER' AND
    "tenantId"=(SELECT "sellerTenantId" FROM "IntercompanyOrder"
      WHERE "poNumber"='P-20261110-0001')) AS seller_stock;

-- Baseline structural source checks, no account secrets or document bytes:
SELECT c.relname AS model, a.attname AS column_name,
  pg_catalog.format_type(a.atttypid,a.atttypmod) AS sql_type
FROM pg_attribute a
JOIN pg_class c ON c.oid=a.attrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
  ('Invoice','User','Tenant','B2BCreditNote')
  AND a.attnum>0 AND NOT a.attisdropped
  AND a.attname IN ('id','tenantId','sellerTenantId','originalInvoiceId',
                    'role','status','invoiceNumber')
ORDER BY c.relname,a.attnum;

-- Run the existing 29-table deterministic row-count/content-hash comparison
-- against a FRESH encrypted-backup independent Restore of this precise source.
-- The previous recovery database contains older snapshots and is NOT fresh
-- evidence for new 12th-migration approval.
