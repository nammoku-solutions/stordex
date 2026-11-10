-- ISSUE #82 — DRAFT / disposable PostgreSQL only.
-- Depends on 20261104150000_b2b_seller_line_provenance and
--            20261104153000_b2b_return_requests.
-- Do NOT apply in Staging without restore testing and owner migration approval.
CREATE TYPE "B2BReturnStockPhase" AS ENUM ('DISPATCH', 'INSPECTION');

CREATE TABLE "B2BReturnStockEvent" (
  "id" TEXT NOT NULL,
  "returnItemId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "phase" "B2BReturnStockPhase" NOT NULL,
  "eventId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "saleable" INTEGER NOT NULL DEFAULT 0,
  "unsaleable" INTEGER NOT NULL DEFAULT 0,
  "movementId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "B2BReturnStockEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "B2BReturnStockEvent_qty_check" CHECK (
    "quantity" > 0 AND "saleable" >= 0 AND "unsaleable" >= 0 AND
    (
      ("phase" = 'DISPATCH' AND "saleable" = 0 AND "unsaleable" = 0
        AND "movementId" IS NOT NULL)
      OR
      ("phase" = 'INSPECTION' AND "saleable" + "unsaleable" = "quantity" AND
        (("saleable" = 0 AND "movementId" IS NULL) OR
         ("saleable" > 0 AND "movementId" IS NOT NULL)))
    )
  ),
  CONSTRAINT "B2BReturnStockEvent_hash_check"
    CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "B2BReturnStockEvent_uuid_check"
    CHECK ("eventId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);

CREATE UNIQUE INDEX "B2BReturnStockEvent_tenantId_phase_eventId_key"
  ON "B2BReturnStockEvent"("tenantId", "phase", "eventId");
CREATE UNIQUE INDEX "B2BReturnStockEvent_movementId_key"
  ON "B2BReturnStockEvent"("movementId");
CREATE INDEX "B2BReturnStockEvent_returnItemId_phase_createdAt_idx"
  ON "B2BReturnStockEvent"("returnItemId", "phase", "createdAt");
CREATE INDEX "B2BReturnStockEvent_tenantId_createdAt_idx"
  ON "B2BReturnStockEvent"("tenantId", "createdAt");

ALTER TABLE "B2BReturnStockEvent"
  ADD CONSTRAINT "B2BReturnStockEvent_returnItemId_fkey"
  FOREIGN KEY ("returnItemId") REFERENCES "B2BReturnItem"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BReturnStockEvent"
  ADD CONSTRAINT "B2BReturnStockEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BReturnStockEvent"
  ADD CONSTRAINT "B2BReturnStockEvent_movementId_fkey"
  FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- This DB guard is defense-in-depth, not a replacement for a tenant-scoped
-- SERIALIZABLE server action which atomically CAS-updates stock and writes
-- the underlying InventoryMovement + event.
CREATE FUNCTION stordex_guard_b2b_return_stock_event()
RETURNS trigger LANGUAGE plpgsql AS $return_stock_guard$
DECLARE
  buyer_tenant TEXT;
  seller_tenant TEXT;
  linked_seller_item TEXT;
  linked_buyer_item TEXT;
  actor_tenant TEXT;
  actor_role TEXT;
  actor_tenant_status TEXT;
  movement_tenant TEXT;
  movement_item TEXT;
  movement_type TEXT;
  movement_quantity INTEGER;
  expected_item TEXT;
  expected_type TEXT;
  expected_qty INTEGER;
  approved_qty INTEGER;
  request_status TEXT;
  already_dispatched BIGINT;
  already_inspected BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Return stock events are immutable';
  END IF;

  -- Serialize additions across both companies for the SAME approved
  -- return line; later inspectors cannot race outstanding dispatch counts.
  SELECT ri."approvedQuantity", rr.status::text, co."buyerTenantId", co."sellerTenantId",
         poi."itemId", soi."itemId"
    INTO approved_qty, request_status, buyer_tenant, seller_tenant,
         linked_buyer_item, linked_seller_item
  FROM "B2BReturnItem" ri
  JOIN "B2BReturnRequest" rr ON rr.id = ri."returnRequestId"
  JOIN "IntercompanyOrder" co ON co.id = rr."intercompanyOrderId"
  JOIN "IntercompanyOrderItem" coli ON coli.id = ri."sourceLineId"
  JOIN "PurchaseOrderItem" poi ON poi.id = coli."sourcePurchaseOrderItemId"
  LEFT JOIN "OrderItem" soi ON soi.id = coli."sellerOrderItemId"
  WHERE ri.id = NEW."returnItemId"
  FOR UPDATE OF ri;

  IF approved_qty IS NULL OR approved_qty <= 0 THEN
    RAISE EXCEPTION 'Return line is missing or has no approved quantity';
  END IF;
  IF request_status NOT IN ('APPROVED', 'PARTIALLY_APPROVED', 'DISPATCHED', 'PARTIALLY_INSPECTED') THEN
    RAISE EXCEPTION 'Return request is not in a physical-posting status';
  END IF;
  IF NEW."phase" = 'DISPATCH' THEN
    IF NEW."tenantId" IS DISTINCT FROM buyer_tenant THEN
      RAISE EXCEPTION 'Dispatch tenant must match return buyer tenant';
    END IF;
    expected_item := linked_buyer_item;
    expected_type := 'OUTBOUND';
    expected_qty := NEW."quantity";
  ELSE
    IF NEW."tenantId" IS DISTINCT FROM seller_tenant THEN
      RAISE EXCEPTION 'Inspection tenant must match return seller tenant';
    END IF;
    expected_item := linked_seller_item;
    expected_type := 'INBOUND';
    expected_qty := NEW."saleable";
  END IF;

  IF expected_item IS NULL THEN
    RAISE EXCEPTION 'Verified item linkage is required for return stock posting';
  END IF;

  SELECT u."tenantId", u.role::text, t.status::text
    INTO actor_tenant, actor_role, actor_tenant_status
  FROM "User" u JOIN "Tenant" t ON t.id = u."tenantId"
  WHERE u.id = NEW."createdByUserId";
  IF actor_tenant IS DISTINCT FROM NEW."tenantId" OR
     actor_role NOT IN ('OWNER', 'ADMIN') OR
     actor_tenant_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Only an active tenant administrator may post a return event';
  END IF;

  IF NEW."movementId" IS NOT NULL THEN
    SELECT im."tenantId", im."itemId", im.type::text, im.quantity
      INTO movement_tenant, movement_item, movement_type, movement_quantity
    FROM "InventoryMovement" im WHERE im.id = NEW."movementId";
    IF movement_tenant IS DISTINCT FROM NEW."tenantId" OR
       movement_item IS DISTINCT FROM expected_item OR
       movement_type IS DISTINCT FROM expected_type OR
       movement_quantity IS DISTINCT FROM expected_qty THEN
      RAISE EXCEPTION 'Return event movement tenant/item/type/quantity mismatch';
    END IF;
  END IF;

  SELECT COALESCE(SUM("quantity"),0) INTO already_dispatched
  FROM "B2BReturnStockEvent"
  WHERE "returnItemId" = NEW."returnItemId" AND "phase" = 'DISPATCH';

  IF NEW."phase" = 'DISPATCH' THEN
    IF already_dispatched + NEW."quantity" > approved_qty THEN
      RAISE EXCEPTION 'Return dispatch exceeds approved quantity';
    END IF;
  ELSE
    SELECT COALESCE(SUM("quantity"),0) INTO already_inspected
    FROM "B2BReturnStockEvent"
    WHERE "returnItemId" = NEW."returnItemId" AND "phase" = 'INSPECTION';
    IF already_inspected + NEW."quantity" > already_dispatched THEN
      RAISE EXCEPTION 'Return inspection exceeds dispatched quantity';
    END IF;
  END IF;

  RETURN NEW;
END;
$return_stock_guard$;

CREATE TRIGGER "B2BReturnStockEvent_insert_guard"
  BEFORE INSERT ON "B2BReturnStockEvent"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_b2b_return_stock_event();
CREATE TRIGGER "B2BReturnStockEvent_immutable_guard"
  BEFORE UPDATE OR DELETE ON "B2BReturnStockEvent"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_b2b_return_stock_event();


-- Defense-in-depth: a return event cannot be preserved while its linked
-- inventory movement is subsequently edited to misrepresent stock history.
CREATE FUNCTION stordex_guard_return_linked_movement()
RETURNS trigger LANGUAGE plpgsql AS $return_movement_guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "B2BReturnStockEvent"
    WHERE "movementId" = OLD.id
  ) THEN
    RAISE EXCEPTION 'Return-linked inventory movements are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$return_movement_guard$;

CREATE TRIGGER "InventoryMovement_return_linked_immutable_guard"
  BEFORE UPDATE OR DELETE ON "InventoryMovement"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_return_linked_movement();
