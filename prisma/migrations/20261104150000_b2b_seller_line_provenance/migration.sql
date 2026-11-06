-- Issue #82 / PREPARATION ONLY. Must not be applied to live Staging without
-- fresh backup, verified isolated restore, and explicit migration approval.
-- Add a nullable origin pointer for seller OrderItem created at B2B acceptance.
-- Historical/legacy accepted B2B lines remain NULL; never guess a mapping.
ALTER TABLE "IntercompanyOrderItem"
  ADD COLUMN "sellerOrderItemId" TEXT;

CREATE UNIQUE INDEX "IntercompanyOrderItem_sellerOrderItemId_key"
  ON "IntercompanyOrderItem"("sellerOrderItemId");

ALTER TABLE "IntercompanyOrderItem"
  ADD CONSTRAINT "IntercompanyOrderItem_sellerOrderItemId_fkey"
  FOREIGN KEY ("sellerOrderItemId") REFERENCES "OrderItem"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A foreign key to OrderItem.id alone does not establish tenant or source
-- order provenance. The trigger rejects any link to an item belonging to
-- another seller tenant or a different seller order of that tenant.
CREATE FUNCTION stordex_guard_b2b_seller_line_mapping()
RETURNS trigger LANGUAGE plpgsql AS $mapping_guard$
DECLARE
  linked_order_id TEXT;
  seller_tenant_id TEXT;
  item_order_id TEXT;
  item_tenant_id TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."sellerOrderItemId" IS NOT NULL
     AND NEW."sellerOrderItemId" IS DISTINCT FROM OLD."sellerOrderItemId" THEN
    RAISE EXCEPTION 'An established B2B seller-line link is immutable';
  END IF;
  IF NEW."sellerOrderItemId" IS NULL THEN RETURN NEW; END IF;

  SELECT co."sellerOrderId", co."sellerTenantId"
    INTO linked_order_id, seller_tenant_id
  FROM "IntercompanyOrder" co WHERE co.id = NEW."intercompanyOrderId";

  SELECT line."orderId", ord."tenantId"
    INTO item_order_id, item_tenant_id
  FROM "OrderItem" line
  JOIN "Order" ord ON ord.id = line."orderId"
  WHERE line.id = NEW."sellerOrderItemId";

  IF linked_order_id IS NULL OR item_order_id IS NULL OR
     linked_order_id IS DISTINCT FROM item_order_id OR
     seller_tenant_id IS DISTINCT FROM item_tenant_id THEN
    RAISE EXCEPTION 'B2B seller line must belong to the linked seller order/tenant';
  END IF;
  RETURN NEW;
END;
$mapping_guard$;

CREATE TRIGGER "IntercompanyOrderItem_sellerLine_guard"
  BEFORE INSERT OR UPDATE OF "sellerOrderItemId", "intercompanyOrderId"
  ON "IntercompanyOrderItem"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_b2b_seller_line_mapping();
