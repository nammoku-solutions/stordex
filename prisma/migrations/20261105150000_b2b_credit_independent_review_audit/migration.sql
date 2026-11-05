-- Issue #82: additive, DRAFT-ONLY independent review evidence.
-- Depends on 20261105113000_b2b_credit_note_drafts.
-- DO NOT migrate Staging/Production without Issue #109 recovery and owner approval.
CREATE TYPE "B2BCreditReviewAction" AS ENUM ('CHECKS_RECORDED', 'NEEDS_REVISION');

CREATE TABLE "B2BCreditReviewAudit" (
  "id" TEXT NOT NULL,
  "creditNoteId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "action" "B2BCreditReviewAction" NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "reviewNote" TEXT NOT NULL,
  "sourceSnapshotHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "B2BCreditReviewAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "B2BCreditReviewAudit_uuid_check" CHECK
    ("eventId" ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
  CONSTRAINT "B2BCreditReviewAudit_snapshot_check" CHECK
    ("sourceSnapshotHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "B2BCreditReviewAudit_note_check" CHECK
    (length(trim("reviewNote")) BETWEEN 1 AND 1000)
);

CREATE UNIQUE INDEX "B2BCreditReviewAudit_sellerTenantId_eventId_key"
  ON "B2BCreditReviewAudit"("sellerTenantId", "eventId");
CREATE INDEX "B2BCreditReviewAudit_creditNoteId_createdAt_idx"
  ON "B2BCreditReviewAudit"("creditNoteId", "createdAt");
CREATE INDEX "B2BCreditReviewAudit_sellerTenantId_createdAt_idx"
  ON "B2BCreditReviewAudit"("sellerTenantId", "createdAt");

ALTER TABLE "B2BCreditReviewAudit"
  ADD CONSTRAINT "B2BCreditReviewAudit_creditNoteId_fkey"
    FOREIGN KEY ("creditNoteId") REFERENCES "B2BCreditNote"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BCreditReviewAudit"
  ADD CONSTRAINT "B2BCreditReviewAudit_sellerTenantId_fkey"
    FOREIGN KEY ("sellerTenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "B2BCreditReviewAudit"
  ADD CONSTRAINT "B2BCreditReviewAudit_reviewerUserId_fkey"
    FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lock the source draft before accepting review evidence.
-- No approval/issuing/offset/refund happens here.
CREATE FUNCTION stordex_guard_b2b_credit_review_audit()
RETURNS trigger LANGUAGE plpgsql AS $credit_review_guard$
DECLARE
  author_id TEXT;
  credit_tenant TEXT;
  credit_status TEXT;
  reviewer_tenant TEXT;
  reviewer_role TEXT;
  reviewer_active TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Credit review audit is append-only';
  END IF;
  SELECT cn."sellerTenantId", cn."createdByUserId", cn.status::text
    INTO credit_tenant, author_id, credit_status
  FROM "B2BCreditNote" cn
  WHERE cn.id = NEW."creditNoteId"
  FOR UPDATE;
  IF credit_tenant IS DISTINCT FROM NEW."sellerTenantId" OR
     credit_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Only source seller DRAFT credit can be independently reviewed';
  END IF;

  SELECT u."tenantId", u.role::text, t.status::text
    INTO reviewer_tenant, reviewer_role, reviewer_active
  FROM "User" u
  JOIN "Tenant" t ON t.id = u."tenantId"
  WHERE u.id = NEW."reviewerUserId";
  IF reviewer_tenant IS DISTINCT FROM NEW."sellerTenantId" OR
     reviewer_role NOT IN ('OWNER','ADMIN') OR
     reviewer_active IS DISTINCT FROM 'ACTIVE' OR
     NEW."reviewerUserId" IS NOT DISTINCT FROM author_id THEN
    RAISE EXCEPTION 'Independent active seller administrator is required for credit review audit';
  END IF;
  RETURN NEW;
END;
$credit_review_guard$;

CREATE TRIGGER "B2BCreditReviewAudit_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "B2BCreditReviewAudit"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_b2b_credit_review_audit();
