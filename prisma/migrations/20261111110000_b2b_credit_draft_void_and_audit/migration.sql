-- Issue #82. UNAPPLIED ELEVENTH migration: audited CreditNote DRAFT -> VOID
-- and release of reserved inspected quantities WITHOUT deleting original lines.
-- Never run on live Staging without a fresh encrypted backup, independent restore,
-- discrete owner approval, and CI PostgreSQL migration / provenance review.
-- Production and all financial posting, issuance, refunds remain OUT OF SCOPE.

ALTER TABLE "B2BCreditNote"
  ADD COLUMN "voidEventId" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedByUserId" TEXT,
  ADD COLUMN "voidReason" TEXT;

ALTER TABLE "B2BCreditNote" DROP CONSTRAINT "B2BCreditNote_draft_only_check";
ALTER TABLE "B2BCreditNote" ADD CONSTRAINT "B2BCreditNote_draft_or_void_only_check"
  CHECK ("status" IN ('DRAFT'::"B2BCreditStatus",'VOID'::"B2BCreditStatus"));
ALTER TABLE "B2BCreditNote" ADD CONSTRAINT "B2BCreditNote_void_metadata_check"
  CHECK (
    ("status" = 'DRAFT'::"B2BCreditStatus" AND
     "voidEventId" IS NULL AND "voidedAt" IS NULL AND
     "voidedByUserId" IS NULL AND "voidReason" IS NULL)
    OR
    ("status" = 'VOID'::"B2BCreditStatus" AND
     "voidEventId" IS NOT NULL AND "voidedAt" IS NOT NULL AND
     "voidedByUserId" IS NOT NULL AND "voidReason" IS NOT NULL AND
     length(btrim("voidReason")) BETWEEN 8 AND 500 AND
     "voidEventId" ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
  );

CREATE UNIQUE INDEX "B2BCreditNote_voidEventId_key"
  ON "B2BCreditNote"("voidEventId");
ALTER TABLE "B2BCreditNote" ADD CONSTRAINT "B2BCreditNote_voidedByUserId_fkey"
  FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "B2BCreditVoidEvent" (
  "id" TEXT NOT NULL,
  "creditNoteId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "B2BCreditVoidEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "B2BCreditVoidEvent_creditNoteId_key"
  ON "B2BCreditVoidEvent"("creditNoteId");
CREATE UNIQUE INDEX "B2BCreditVoidEvent_eventId_key"
  ON "B2BCreditVoidEvent"("eventId");
ALTER TABLE "B2BCreditVoidEvent" ADD CONSTRAINT "B2BCreditVoidEvent_creditNoteId_fkey"
  FOREIGN KEY ("creditNoteId") REFERENCES "B2BCreditNote"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BCreditVoidEvent" ADD CONSTRAINT "B2BCreditVoidEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep original 10th migration invoice/seller provenance guard, but permit
-- only a single seller-admin VOID. Never allow editing a VOID back to DRAFT.
CREATE OR REPLACE FUNCTION stordex_guard_b2b_credit_header()
RETURNS trigger LANGUAGE plpgsql AS $credit_header$
DECLARE
  invoice_row "Invoice"%ROWTYPE;
  request_seller TEXT;
  request_order TEXT;
  actor_tenant TEXT;
  actor_role TEXT;
  actor_active TEXT;
  void_actor_tenant TEXT;
  void_actor_role TEXT;
  void_actor_active TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'B2B credit draft provenance cannot be deleted';
  END IF;
  -- Only draft creation and ONE audit-retained DRAFT -> VOID transition exist.
  -- No issuance, monetary settlement, refund or delete is enabled.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'DRAFT'::"B2BCreditStatus" OR
       NEW."voidEventId" IS NOT NULL OR NEW."voidedAt" IS NOT NULL OR
       NEW."voidedByUserId" IS NOT NULL OR NEW."voidReason" IS NOT NULL THEN
      RAISE EXCEPTION 'Only fresh non-voided DRAFT may be inserted';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'VOID'::"B2BCreditStatus" THEN
      RAISE EXCEPTION 'VOID CreditNote is immutable and retains its audit';
    ELSIF NEW.status = 'DRAFT'::"B2BCreditStatus" THEN
      IF NEW."voidEventId" IS NOT NULL OR NEW."voidedAt" IS NOT NULL OR
         NEW."voidedByUserId" IS NOT NULL OR NEW."voidReason" IS NOT NULL THEN
        RAISE EXCEPTION 'A DRAFT cannot have void metadata';
      END IF;
    ELSIF OLD.status = 'DRAFT'::"B2BCreditStatus" AND
          NEW.status = 'VOID'::"B2BCreditStatus" THEN
      IF NEW."voidEventId" IS NULL OR
         NEW."voidEventId" !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR
         NEW."voidedByUserId" IS NULL OR NEW."voidReason" IS NULL OR
         length(btrim(NEW."voidReason")) < 8 OR
         length(NEW."voidReason") > 500 THEN
        RAISE EXCEPTION 'CreditNote VOID requires idempotent event, actor, and reason';
      END IF;
      IF NEW."proposedSubtotal" IS DISTINCT FROM OLD."proposedSubtotal" OR
         NEW."proposedTax" IS DISTINCT FROM OLD."proposedTax" OR
         NEW."proposedTotal" IS DISTINCT FROM OLD."proposedTotal" OR
         NEW."taxAllocationExplanation" IS DISTINCT FROM OLD."taxAllocationExplanation" THEN
        RAISE EXCEPTION 'VOID may not edit proposed financial amounts';
      END IF;
      SELECT u."tenantId", u.role::text, t.status::text
        INTO void_actor_tenant, void_actor_role, void_actor_active
        FROM "User" u JOIN "Tenant" t ON t.id=u."tenantId"
        WHERE u.id=NEW."voidedByUserId";
      IF void_actor_tenant IS DISTINCT FROM NEW."sellerTenantId" OR
         void_actor_role NOT IN ('OWNER','ADMIN') OR
         void_actor_active IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'VOID requires an active seller OWNER/ADMIN';
      END IF;
      NEW."voidedAt" := clock_timestamp();
    ELSE
      RAISE EXCEPTION 'CreditNote status transition not authorized';
    END IF;
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

-- Event is inserted by an AFTER UPDATE trigger, in the SAME transaction as
-- the VOID transition. A failure to write audit rolls back the VOID as well.
CREATE FUNCTION stordex_record_b2b_credit_void_event()
RETURNS trigger LANGUAGE plpgsql AS $credit_void_audit$
BEGIN
  IF OLD.status IS DISTINCT FROM 'DRAFT'::"B2BCreditStatus" OR
     NEW.status IS DISTINCT FROM 'VOID'::"B2BCreditStatus" THEN
    RAISE EXCEPTION 'Only DRAFT-to-VOID transitions can create void events';
  END IF;
  INSERT INTO "B2BCreditVoidEvent"
    ("id","creditNoteId","eventId","actorUserId","reason","createdAt")
    VALUES (gen_random_uuid()::text,NEW.id,NEW."voidEventId",
            NEW."voidedByUserId",NEW."voidReason",NEW."voidedAt");
  RETURN NULL;
END;
$credit_void_audit$;
CREATE TRIGGER "B2BCreditNote_void_event"
  AFTER UPDATE OF "status" ON "B2BCreditNote"
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION stordex_record_b2b_credit_void_event();

CREATE FUNCTION stordex_guard_b2b_credit_void_event()
RETURNS trigger LANGUAGE plpgsql AS $credit_void_event_guard$
DECLARE
  note_row "B2BCreditNote"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'CreditNote VOID audit events are append-only';
  END IF;
  SELECT * INTO note_row FROM "B2BCreditNote" WHERE id=NEW."creditNoteId";
  IF NOT FOUND OR note_row.status IS DISTINCT FROM 'VOID'::"B2BCreditStatus" OR
     note_row."voidEventId" IS DISTINCT FROM NEW."eventId" OR
     note_row."voidedByUserId" IS DISTINCT FROM NEW."actorUserId" OR
     note_row."voidReason" IS DISTINCT FROM NEW.reason OR
     note_row."voidedAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'CreditNote VOID audit does not match authorized transition';
  END IF;
  RETURN NEW;
END;
$credit_void_event_guard$;
CREATE TRIGGER "B2BCreditVoidEvent_append_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "B2BCreditVoidEvent"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_b2b_credit_void_event();

-- Recompute inspected quantity budget from all NON-VOID credit lines.
-- Source return-item FOR UPDATE serializes concurrent creation/void attempts.
CREATE OR REPLACE FUNCTION stordex_guard_b2b_credit_line()
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
  -- VOID lines remain auditable but no longer reserve inspected units.
  SELECT COALESCE(SUM(l."creditedQuantity"),0) INTO other_allocated
    FROM "B2BCreditNoteLine" l
    JOIN "B2BCreditNote" n ON n.id=l."creditNoteId"
    WHERE l."returnItemId" = NEW."returnItemId"
      AND n.status <> 'VOID'::"B2BCreditStatus"
      AND l.id IS DISTINCT FROM NEW.id;
  IF NEW."creditedQuantity" > approved_count OR
     other_allocated + NEW."creditedQuantity" > inspected_count THEN
    RAISE EXCEPTION 'Credit draft allocation exceeds physically inspected unallocated returns';
  END IF;
  RETURN NEW;
END;
$credit_line$;
