-- Issue #82. DRAFT-ONLY B2B credit note data model.
-- Depends on 20261104150000, 20261104153000 and 20261105100000.
-- DO NOT migrate Staging/Production before independent verified restore,
-- migration-specific owner authorization, financial policy and audit review.
CREATE TYPE "B2BCreditStatus" AS ENUM ('DRAFT', 'RECONCILED', 'ISSUED', 'APPLIED', 'VOID');

-- Required for composite same-return-request FK from credit lines.
CREATE UNIQUE INDEX "B2BReturnItem_id_returnRequestId_key"
  ON "B2BReturnItem"("id", "returnRequestId");

CREATE TABLE "B2BCreditNote" (
  "id" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "originalInvoiceId" TEXT NOT NULL,
  "sellerOrderId" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "creditNoteNumber" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "status" "B2BCreditStatus" NOT NULL DEFAULT 'DRAFT',
  "originalInvoiceSubtotal" INTEGER NOT NULL,
  "originalInvoiceTax" INTEGER NOT NULL,
  "originalInvoiceTotal" INTEGER NOT NULL,
  "originalInvoiceTaxRate" INTEGER NOT NULL,
  "originalInvoiceTaxPerOrder" BOOLEAN NOT NULL,
  "proposedSubtotal" INTEGER,
  "proposedTax" INTEGER,
  "proposedTotal" INTEGER,
  "taxAllocationExplanation" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "B2BCreditNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "B2BCreditNote_draft_only_check" CHECK ("status" = 'DRAFT'),
  CONSTRAINT "B2BCreditNote_currency_check"
    CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "B2BCreditNote_amount_check" CHECK (
    "originalInvoiceSubtotal" >= 0 AND "originalInvoiceTax" >= 0 AND
    "originalInvoiceTotal" >= 0 AND
    "originalInvoiceSubtotal" + "originalInvoiceTax" = "originalInvoiceTotal" AND
    "originalInvoiceTaxRate" BETWEEN 0 AND 100 AND
    (
      ("proposedSubtotal" IS NULL AND "proposedTax" IS NULL AND
       "proposedTotal" IS NULL) OR
      ("proposedSubtotal" IS NOT NULL AND "proposedTax" IS NOT NULL AND
       "proposedTotal" IS NOT NULL AND
       "proposedSubtotal" >= 0 AND "proposedTax" >= 0 AND
       "proposedSubtotal" + "proposedTax" = "proposedTotal" AND
       "proposedTotal" <= "originalInvoiceTotal")
    )
  ),
  CONSTRAINT "B2BCreditNote_tax_note_check"
    CHECK ("taxAllocationExplanation" IS NULL OR length("taxAllocationExplanation") <= 1000)
);

CREATE TABLE "B2BCreditNoteLine" (
  "id" TEXT NOT NULL,
  "creditNoteId" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "returnItemId" TEXT NOT NULL,
  "creditedQuantity" INTEGER NOT NULL,
  "proposedSubtotal" INTEGER,
  "proposedTax" INTEGER,
  "proposedTotal" INTEGER,
  "explanation" TEXT,
  CONSTRAINT "B2BCreditNoteLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "B2BCreditNoteLine_amount_check" CHECK (
    "creditedQuantity" > 0 AND (
      ("proposedSubtotal" IS NULL AND "proposedTax" IS NULL AND "proposedTotal" IS NULL) OR
      ("proposedSubtotal" IS NOT NULL AND "proposedTax" IS NOT NULL AND
       "proposedTotal" IS NOT NULL AND
       "proposedSubtotal" >= 0 AND "proposedTax" >= 0 AND
       "proposedSubtotal" + "proposedTax" = "proposedTotal")
    )
  ),
  CONSTRAINT "B2BCreditNoteLine_explanation_check"
    CHECK ("explanation" IS NULL OR length("explanation") <= 1000)
);

CREATE UNIQUE INDEX "B2BCreditNote_sellerTenantId_creditNoteNumber_key"
  ON "B2BCreditNote"("sellerTenantId", "creditNoteNumber");
CREATE UNIQUE INDEX "B2BCreditNote_id_returnRequestId_key"
  ON "B2BCreditNote"("id", "returnRequestId");
CREATE INDEX "B2BCreditNote_originalInvoiceId_createdAt_idx"
  ON "B2BCreditNote"("originalInvoiceId", "createdAt");
CREATE INDEX "B2BCreditNote_returnRequestId_createdAt_idx"
  ON "B2BCreditNote"("returnRequestId", "createdAt");
CREATE INDEX "B2BCreditNote_sellerTenantId_status_createdAt_idx"
  ON "B2BCreditNote"("sellerTenantId", "status", "createdAt");

CREATE UNIQUE INDEX "B2BCreditNoteLine_creditNoteId_returnItemId_key"
  ON "B2BCreditNoteLine"("creditNoteId", "returnItemId");
CREATE INDEX "B2BCreditNoteLine_returnItemId_idx"
  ON "B2BCreditNoteLine"("returnItemId");

ALTER TABLE "B2BCreditNote"
  ADD CONSTRAINT "B2BCreditNote_sellerTenantId_fkey"
    FOREIGN KEY ("sellerTenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BCreditNote"
  ADD CONSTRAINT "B2BCreditNote_originalInvoiceId_fkey"
    FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
-- Credit Note MUST target a seller Order truly included on the original invoice.
ALTER TABLE "B2BCreditNote"
  ADD CONSTRAINT "B2BCreditNote_originalInvoiceId_sellerOrderId_fkey"
    FOREIGN KEY ("originalInvoiceId", "sellerOrderId")
    REFERENCES "InvoiceOrder"("invoiceId", "orderId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BCreditNote"
  ADD CONSTRAINT "B2BCreditNote_returnRequestId_fkey"
    FOREIGN KEY ("returnRequestId") REFERENCES "B2BReturnRequest"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "B2BCreditNoteLine"
  ADD CONSTRAINT "B2BCreditNoteLine_creditNoteId_returnRequestId_fkey"
    FOREIGN KEY ("creditNoteId", "returnRequestId")
    REFERENCES "B2BCreditNote"("id", "returnRequestId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BCreditNoteLine"
  ADD CONSTRAINT "B2BCreditNoteLine_returnItemId_returnRequestId_fkey"
    FOREIGN KEY ("returnItemId", "returnRequestId")
    REFERENCES "B2BReturnItem"("id", "returnRequestId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense in depth: bind the original invoice to the exact seller tenant
-- and seller Order that created this return; lock the Invoice row while
-- taking the immutable snapshot. No claim that this is a refundable amount.
CREATE FUNCTION stordex_guard_b2b_credit_header()
RETURNS trigger LANGUAGE plpgsql AS $credit_header$
DECLARE
  invoice_row "Invoice"%ROWTYPE;
  request_seller TEXT;
  request_order TEXT;
  actor_tenant TEXT;
  actor_role TEXT;
  actor_active TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'B2B credit draft provenance cannot be deleted';
  END IF;
  IF NEW.status IS DISTINCT FROM 'DRAFT'::"B2BCreditStatus" THEN
    RAISE EXCEPTION 'Credit note issue/application is not yet enabled';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW."sellerTenantId" IS DISTINCT FROM OLD."sellerTenantId" OR
    NEW."originalInvoiceId" IS DISTINCT FROM OLD."originalInvoiceId" OR
    NEW."sellerOrderId" IS DISTINCT FROM OLD."sellerOrderId" OR
    NEW."returnRequestId" IS DISTINCT FROM OLD."returnRequestId" OR
    NEW."creditNoteNumber" IS DISTINCT FROM OLD."creditNoteNumber" OR
    NEW."currencyCode" IS DISTINCT FROM OLD."currencyCode" OR
    NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId" OR
    NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR
    NEW."originalInvoiceSubtotal" IS DISTINCT FROM OLD."originalInvoiceSubtotal" OR
    NEW."originalInvoiceTax" IS DISTINCT FROM OLD."originalInvoiceTax" OR
    NEW."originalInvoiceTotal" IS DISTINCT FROM OLD."originalInvoiceTotal" OR
    NEW."originalInvoiceTaxRate" IS DISTINCT FROM OLD."originalInvoiceTaxRate" OR
    NEW."originalInvoiceTaxPerOrder" IS DISTINCT FROM OLD."originalInvoiceTaxPerOrder"
  ) THEN
    RAISE EXCEPTION 'Original invoice/return and credit document provenance are immutable';
  END IF;

  SELECT * INTO invoice_row FROM "Invoice"
    WHERE id = NEW."originalInvoiceId" FOR UPDATE;
  IF NOT FOUND OR invoice_row."tenantId" IS DISTINCT FROM NEW."sellerTenantId" OR
     invoice_row.status NOT IN ('ISSUED', 'PAID') THEN
    RAISE EXCEPTION 'Credit note requires a matching issued/paid seller invoice';
  END IF;
  IF NEW."originalInvoiceSubtotal" IS DISTINCT FROM invoice_row.subtotal OR
     NEW."originalInvoiceTax" IS DISTINCT FROM invoice_row.tax OR
     NEW."originalInvoiceTotal" IS DISTINCT FROM invoice_row.total OR
     NEW."originalInvoiceTaxRate" IS DISTINCT FROM invoice_row."taxRate" OR
     NEW."originalInvoiceTaxPerOrder" IS DISTINCT FROM invoice_row."taxPerOrder" THEN
    RAISE EXCEPTION 'Original invoice accounting snapshot does not match';
  END IF;
  SELECT rr."sellerTenantId", co."sellerOrderId"
    INTO request_seller, request_order
    FROM "B2BReturnRequest" rr
    JOIN "IntercompanyOrder" co ON co.id = rr."intercompanyOrderId"
    WHERE rr.id = NEW."returnRequestId";
  IF request_seller IS DISTINCT FROM NEW."sellerTenantId" OR
     request_order IS DISTINCT FROM NEW."sellerOrderId" THEN
    RAISE EXCEPTION 'Credit note tenant/seller order/return request mismatch';
  END IF;
  SELECT u."tenantId", u.role::text, t.status::text
    INTO actor_tenant, actor_role, actor_active
    FROM "User" u JOIN "Tenant" t ON t.id = u."tenantId"
    WHERE u.id = NEW."createdByUserId";
  IF actor_tenant IS DISTINCT FROM NEW."sellerTenantId" OR
     actor_role IS DISTINCT FROM 'OWNER' AND actor_role IS DISTINCT FROM 'ADMIN' OR
     actor_active IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Credit note draft requires an active seller administrator';
  END IF;
  RETURN NEW;
END;
$credit_header$;
CREATE TRIGGER "B2BCreditNote_header_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "B2BCreditNote"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_b2b_credit_header();

-- Serialize credit quantity allocation across drafts on each return item.
-- Concurrent inserts on distinct credit note headers cannot over-allocate.
CREATE FUNCTION stordex_guard_b2b_credit_line()
RETURNS trigger LANGUAGE plpgsql AS $credit_line$
DECLARE
  approved_count INTEGER;
  inspected_count BIGINT;
  other_allocated BIGINT;
  credit_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'B2B credit draft allocation lines cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW."creditNoteId" IS DISTINCT FROM OLD."creditNoteId" OR
    NEW."returnRequestId" IS DISTINCT FROM OLD."returnRequestId" OR
    NEW."returnItemId" IS DISTINCT FROM OLD."returnItemId" OR
    NEW."creditedQuantity" IS DISTINCT FROM OLD."creditedQuantity"
  ) THEN
    RAISE EXCEPTION 'B2B credit draft allocation identity/quantity is immutable';
  END IF;

  SELECT ri."approvedQuantity" INTO approved_count
  FROM "B2BReturnItem" ri WHERE ri.id = NEW."returnItemId" FOR UPDATE;
  IF approved_count IS NULL OR approved_count <= 0 THEN
    RAISE EXCEPTION 'Credit allocation needs an approved return line';
  END IF;
  SELECT cn.status::text INTO credit_status
  FROM "B2BCreditNote" cn WHERE cn.id = NEW."creditNoteId";
  IF credit_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Only draft credit notes may contain proposed allocations';
  END IF;
  SELECT COALESCE(SUM(e.quantity),0) INTO inspected_count
    FROM "B2BReturnStockEvent" e
    WHERE e."returnItemId" = NEW."returnItemId" AND e.phase='INSPECTION';
  SELECT COALESCE(SUM(l."creditedQuantity"),0) INTO other_allocated
    FROM "B2BCreditNoteLine" l
    WHERE l."returnItemId" = NEW."returnItemId"
      AND l.id IS DISTINCT FROM NEW.id;
  IF NEW."creditedQuantity" > approved_count OR
     other_allocated + NEW."creditedQuantity" > inspected_count THEN
    RAISE EXCEPTION 'Credit draft allocation exceeds physically inspected unallocated returns';
  END IF;
  RETURN NEW;
END;
$credit_line$;
CREATE TRIGGER "B2BCreditNoteLine_alloc_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "B2BCreditNoteLine"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_b2b_credit_line();
