CREATE TYPE "IntercompanyOrderStatus" AS ENUM ('SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED');

CREATE TABLE "IntercompanyOrder" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "buyerTenantId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "sellerOrderId" TEXT,
  "poNumber" TEXT NOT NULL,
  "orderDate" TIMESTAMP(3) NOT NULL,
  "deliveryDate" TIMESTAMP(3),
  "subtotal" INTEGER NOT NULL,
  "taxRate" INTEGER NOT NULL,
  "tax" INTEGER NOT NULL,
  "total" INTEGER NOT NULL,
  "note" TEXT,
  "status" "IntercompanyOrderStatus" NOT NULL DEFAULT 'SENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntercompanyOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntercompanyOrder_distinct_tenants" CHECK ("buyerTenantId" <> "sellerTenantId")
);

CREATE TABLE "IntercompanyOrderItem" (
  "id" TEXT NOT NULL,
  "intercompanyOrderId" TEXT NOT NULL,
  "sourcePurchaseOrderItemId" TEXT NOT NULL,
  "buyerItemCode" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  CONSTRAINT "IntercompanyOrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntercompanyOrderItem_positive_quantity" CHECK ("quantity" > 0),
  CONSTRAINT "IntercompanyOrderItem_nonnegative_price" CHECK ("unitPrice" >= 0)
);

CREATE UNIQUE INDEX "IntercompanyOrder_purchaseOrderId_key" ON "IntercompanyOrder"("purchaseOrderId");
CREATE UNIQUE INDEX "IntercompanyOrder_sellerOrderId_key" ON "IntercompanyOrder"("sellerOrderId");
CREATE INDEX "IntercompanyOrder_sellerTenantId_status_createdAt_idx" ON "IntercompanyOrder"("sellerTenantId","status","createdAt");
CREATE INDEX "IntercompanyOrder_buyerTenantId_createdAt_idx" ON "IntercompanyOrder"("buyerTenantId","createdAt");
CREATE UNIQUE INDEX "IntercompanyOrderItem_intercompanyOrderId_sourcePurchaseOrderItemId_key"
 ON "IntercompanyOrderItem"("intercompanyOrderId", "sourcePurchaseOrderItemId");
CREATE INDEX "IntercompanyOrderItem_intercompanyOrderId_idx" ON "IntercompanyOrderItem"("intercompanyOrderId");

ALTER TABLE "IntercompanyOrder" ADD CONSTRAINT "IntercompanyOrder_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "TradingConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntercompanyOrder" ADD CONSTRAINT "IntercompanyOrder_buyerTenantId_fkey"
  FOREIGN KEY ("buyerTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntercompanyOrder" ADD CONSTRAINT "IntercompanyOrder_sellerTenantId_fkey"
  FOREIGN KEY ("sellerTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntercompanyOrder" ADD CONSTRAINT "IntercompanyOrder_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntercompanyOrder" ADD CONSTRAINT "IntercompanyOrder_sellerOrderId_fkey"
  FOREIGN KEY ("sellerOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntercompanyOrderItem" ADD CONSTRAINT "IntercompanyOrderItem_intercompanyOrderId_fkey"
  FOREIGN KEY ("intercompanyOrderId") REFERENCES "IntercompanyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
