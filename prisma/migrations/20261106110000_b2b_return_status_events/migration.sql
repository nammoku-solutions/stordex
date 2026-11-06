-- Issue #82: append-only physical B2B return status audit, DRAFT ONLY.
-- Never apply on live Staging/Production until #109 independent restore,
-- full migration-order reconciliation and explicit owner approval.
-- Depends on 20261105150000_b2b_credit_independent_review_audit.

CREATE TABLE "B2BReturnStatusEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "sourceTotalsHash" TEXT NOT NULL,
  "fromStatus" "B2BReturnStatus" NOT NULL,
  "toStatus" "B2BReturnStatus" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "B2BReturnStatusEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "B2BReturnStatusEvent_uuid_check" CHECK
    ("eventId" ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
  CONSTRAINT "B2BReturnStatusEvent_hash_check" CHECK
    ("payloadHash" ~ '^[a-f0-9]{64}$' AND
     "sourceTotalsHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "B2BReturnStatusEvent_physical_edges_check" CHECK (
    ("fromStatus" IN ('APPROVED','PARTIALLY_APPROVED') AND "toStatus" = 'DISPATCHED')
    OR ("fromStatus" = 'DISPATCHED' AND "toStatus" IN ('PARTIALLY_INSPECTED','INSPECTED'))
    OR ("fromStatus" = 'PARTIALLY_INSPECTED' AND "toStatus" = 'INSPECTED')
    OR ("fromStatus" = 'INSPECTED' AND "toStatus" = 'CREDIT_PENDING')
  )
);
CREATE UNIQUE INDEX "B2BReturnStatusEvent_tenantId_eventId_key"
  ON "B2BReturnStatusEvent"("tenantId","eventId");
CREATE INDEX "B2BReturnStatusEvent_returnRequestId_createdAt_idx"
  ON "B2BReturnStatusEvent"("returnRequestId","createdAt");
CREATE INDEX "B2BReturnStatusEvent_tenantId_createdAt_idx"
  ON "B2BReturnStatusEvent"("tenantId","createdAt");
ALTER TABLE "B2BReturnStatusEvent"
  ADD CONSTRAINT "B2BReturnStatusEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BReturnStatusEvent"
  ADD CONSTRAINT "B2BReturnStatusEvent_returnRequestId_fkey"
    FOREIGN KEY ("returnRequestId") REFERENCES "B2BReturnRequest"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BReturnStatusEvent"
  ADD CONSTRAINT "B2BReturnStatusEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION stordex_guard_b2b_return_status_event()
RETURNS trigger LANGUAGE plpgsql AS $physical_status$
DECLARE
  buyer_tenant TEXT;
  seller_tenant TEXT;
  actual_status TEXT;
  actor_tenant TEXT;
  actor_role TEXT;
  active_status TEXT;
  allowed_tenant TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Return status history is append-only';
  END IF;
  SELECT rr."buyerTenantId", rr."sellerTenantId", rr.status::text
    INTO buyer_tenant, seller_tenant, actual_status
  FROM "B2BReturnRequest" rr
  WHERE rr.id = NEW."returnRequestId"
  FOR UPDATE;

  IF buyer_tenant IS NULL OR actual_status IS DISTINCT FROM NEW."toStatus"::text THEN
    RAISE EXCEPTION 'Return status audit must follow the same transaction status update';
  END IF;

  allowed_tenant := CASE
    WHEN NEW."toStatus" = 'DISPATCHED' THEN buyer_tenant
    ELSE seller_tenant
  END;
  IF NEW."tenantId" IS DISTINCT FROM allowed_tenant THEN
    RAISE EXCEPTION 'Return status actor tenant does not own this action';
  END IF;
  SELECT u."tenantId", u.role::text, t.status::text
    INTO actor_tenant, actor_role, active_status
  FROM "User" u JOIN "Tenant" t ON t.id = u."tenantId"
  WHERE u.id = NEW."actorUserId";
  IF actor_tenant IS DISTINCT FROM NEW."tenantId" OR
     actor_role NOT IN ('OWNER','ADMIN') OR
     active_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Only active tenant manager may write return status audit';
  END IF;
  RETURN NEW;
END;
$physical_status$;
CREATE TRIGGER "B2BReturnStatusEvent_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "B2BReturnStatusEvent"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_b2b_return_status_event();
