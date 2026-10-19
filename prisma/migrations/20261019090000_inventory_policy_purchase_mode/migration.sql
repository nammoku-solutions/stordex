-- Existing tenants and item balances remain unchanged. Policies are explicitly
-- classified before using on-demand leftover-stock alerts.
CREATE TYPE "StockPolicy" AS ENUM ('STOCKED', 'ON_DEMAND');
CREATE TYPE "PurchaseMode" AS ENUM ('UNIT', 'PACK');

ALTER TABLE "Item"
  ADD COLUMN "stockPolicy" "StockPolicy" NOT NULL DEFAULT 'STOCKED',
  ADD COLUMN "purchaseMode" "PurchaseMode" NOT NULL DEFAULT 'UNIT';

CREATE INDEX "Item_tenantId_stockPolicy_active_idx"
  ON "Item"("tenantId", "stockPolicy", "active");
