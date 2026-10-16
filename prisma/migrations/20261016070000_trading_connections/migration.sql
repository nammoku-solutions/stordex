-- Approved connections are the security boundary for future B2B order exchange.
CREATE TYPE "TradingConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'REVOKED');

CREATE TABLE "TradingConnection" (
    "id" TEXT NOT NULL,
    "tenantAId" TEXT NOT NULL,
    "tenantBId" TEXT NOT NULL,
    "requestedByTenantId" TEXT NOT NULL,
    "status" "TradingConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TradingConnection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TradingConnection_distinct_tenants" CHECK ("tenantAId" < "tenantBId"),
    CONSTRAINT "TradingConnection_valid_requester" CHECK (
      "requestedByTenantId" = "tenantAId" OR "requestedByTenantId" = "tenantBId"
    )
);

CREATE UNIQUE INDEX "TradingConnection_tenantAId_tenantBId_key"
  ON "TradingConnection"("tenantAId", "tenantBId");
CREATE INDEX "TradingConnection_tenantBId_status_idx"
  ON "TradingConnection"("tenantBId", "status");
CREATE INDEX "TradingConnection_tenantAId_status_idx"
  ON "TradingConnection"("tenantAId", "status");

ALTER TABLE "TradingConnection" ADD CONSTRAINT "TradingConnection_tenantAId_fkey"
  FOREIGN KEY ("tenantAId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradingConnection" ADD CONSTRAINT "TradingConnection_tenantBId_fkey"
  FOREIGN KEY ("tenantBId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
