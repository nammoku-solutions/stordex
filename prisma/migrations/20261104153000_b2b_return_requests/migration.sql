-- Issue #82 — DRAFT ONLY: do not apply to Staging/Production before
-- an independently restorable backup, schema approval, and UAT plan.
-- Depends on 20261104150000_b2b_seller_line_provenance.
-- Additive tables only. Existing sales orders, purchase orders and stock
-- are preserved, and no return/credit actions are wired to these tables.

CREATE TYPE "B2BReturnStatus" AS ENUM (
  'SUBMITTED', 'UNDER_REVIEW', 'PARTIALLY_APPROVED', 'APPROVED',
  'REJECTED', 'WITHDRAWN', 'DISPATCHED', 'PARTIALLY_INSPECTED',
  'INSPECTED', 'CREDIT_PENDING', 'CLOSED'
);
CREATE TYPE "B2BReturnReason" AS ENUM (
  'DAMAGED', 'WRONG_ITEM', 'UNWANTED', 'OTHER'
);

CREATE UNIQUE INDEX "IntercompanyOrderItem_id_intercompanyOrderId_key"
  ON "IntercompanyOrderItem"("id", "intercompanyOrderId");

CREATE TABLE "B2BReturnRequest" (
  "id" TEXT NOT NULL,
  "intercompanyOrderId" TEXT NOT NULL,
  "buyerTenantId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "requestNumber" TEXT NOT NULL,
  "status" "B2BReturnStatus" NOT NULL DEFAULT 'SUBMITTED',
  "requestedByUserId" TEXT NOT NULL,
  "reviewedByUserId" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "B2BReturnRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "B2BReturnItem" (
  "id" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "intercompanyOrderId" TEXT NOT NULL,
  "sourceLineId" TEXT NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "approvedQuantity" INTEGER NOT NULL DEFAULT 0,
  "reason" "B2BReturnReason" NOT NULL,
  "note" TEXT,
  "decisionNote" TEXT,
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "B2BReturnItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "B2BReturnItem_quantities_valid"
    CHECK ("requestedQuantity" > 0 AND "approvedQuantity" >= 0
           AND "approvedQuantity" <= "requestedQuantity")
);

CREATE UNIQUE INDEX "B2BReturnRequest_buyerTenantId_requestNumber_key"
  ON "B2BReturnRequest"("buyerTenantId", "requestNumber");
CREATE UNIQUE INDEX "B2BReturnRequest_id_intercompanyOrderId_key"
  ON "B2BReturnRequest"("id", "intercompanyOrderId");
CREATE INDEX "B2BReturnRequest_sellerTenantId_status_createdAt_idx"
  ON "B2BReturnRequest"("sellerTenantId", "status", "createdAt");
CREATE INDEX "B2BReturnRequest_buyerTenantId_status_createdAt_idx"
  ON "B2BReturnRequest"("buyerTenantId", "status", "createdAt");
CREATE INDEX "B2BReturnRequest_intercompanyOrderId_createdAt_idx"
  ON "B2BReturnRequest"("intercompanyOrderId", "createdAt");

CREATE UNIQUE INDEX "B2BReturnItem_returnRequestId_sourceLineId_key"
  ON "B2BReturnItem"("returnRequestId", "sourceLineId");
CREATE INDEX "B2BReturnItem_intercompanyOrderId_sourceLineId_idx"
  ON "B2BReturnItem"("intercompanyOrderId", "sourceLineId");

ALTER TABLE "B2BReturnRequest"
  ADD CONSTRAINT "B2BReturnRequest_intercompanyOrderId_fkey"
  FOREIGN KEY ("intercompanyOrderId") REFERENCES "IntercompanyOrder"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BReturnRequest"
  ADD CONSTRAINT "B2BReturnRequest_buyerTenantId_fkey"
  FOREIGN KEY ("buyerTenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BReturnRequest"
  ADD CONSTRAINT "B2BReturnRequest_sellerTenantId_fkey"
  FOREIGN KEY ("sellerTenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite FKs make it impossible for a ReturnItem to refer to an
-- unrelated B2B source line or another request's IntercompanyOrder.
ALTER TABLE "B2BReturnItem"
  ADD CONSTRAINT "B2BReturnItem_returnRequestId_intercompanyOrderId_fkey"
  FOREIGN KEY ("returnRequestId", "intercompanyOrderId")
  REFERENCES "B2BReturnRequest"("id", "intercompanyOrderId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BReturnItem"
  ADD CONSTRAINT "B2BReturnItem_sourceLineId_intercompanyOrderId_fkey"
  FOREIGN KEY ("sourceLineId", "intercompanyOrderId")
  REFERENCES "IntercompanyOrderItem"("id", "intercompanyOrderId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Parent buyer and seller must match the linked IntercompanyOrder. This
-- forbids forging tenant IDs, even if the caller bypasses application code.
CREATE FUNCTION stordex_assert_b2b_return_tenant_scope()
RETURNS trigger LANGUAGE plpgsql AS $return_scope$
DECLARE
  linked_buyer TEXT;
  linked_seller TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."intercompanyOrderId" IS DISTINCT FROM OLD."intercompanyOrderId"
    OR NEW."buyerTenantId" IS DISTINCT FROM OLD."buyerTenantId"
    OR NEW."sellerTenantId" IS DISTINCT FROM OLD."sellerTenantId"
    OR NEW."requestNumber" IS DISTINCT FROM OLD."requestNumber"
    OR NEW."requestedByUserId" IS DISTINCT FROM OLD."requestedByUserId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'B2B return request provenance is immutable';
  END IF;

  SELECT co."buyerTenantId", co."sellerTenantId"
    INTO linked_buyer, linked_seller
  FROM "IntercompanyOrder" co
  WHERE co.id = NEW."intercompanyOrderId";

  IF linked_buyer IS NULL OR linked_seller IS NULL OR
     linked_buyer IS DISTINCT FROM NEW."buyerTenantId" OR
     linked_seller IS DISTINCT FROM NEW."sellerTenantId" THEN
    RAISE EXCEPTION 'B2B return tenant/order mismatch';
  END IF;
  RETURN NEW;
END;
$return_scope$;

CREATE TRIGGER "B2BReturnRequest_scope_guard"
  BEFORE INSERT OR UPDATE ON "B2BReturnRequest"
  FOR EACH ROW EXECUTE FUNCTION stordex_assert_b2b_return_tenant_scope();

-- Requested source/quantity/reason is an immutable audit assertion; seller
-- can only write decision fields later via a separately reviewed service.
CREATE FUNCTION stordex_guard_b2b_return_line_identity()
RETURNS trigger LANGUAGE plpgsql AS $return_line$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."returnRequestId" IS DISTINCT FROM OLD."returnRequestId"
    OR NEW."intercompanyOrderId" IS DISTINCT FROM OLD."intercompanyOrderId"
    OR NEW."sourceLineId" IS DISTINCT FROM OLD."sourceLineId"
    OR NEW."requestedQuantity" IS DISTINCT FROM OLD."requestedQuantity"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."note" IS DISTINCT FROM OLD."note"
  ) THEN
    RAISE EXCEPTION 'Submitted return line source/quantity is immutable';
  END IF;
  RETURN NEW;
END;
$return_line$;

CREATE TRIGGER "B2BReturnItem_identity_guard"
  BEFORE UPDATE ON "B2BReturnItem"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_b2b_return_line_identity();
