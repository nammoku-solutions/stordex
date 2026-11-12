-- DESIGN PROPOSAL ONLY; DO NOT RUN ON STAGING OR PRODUCTION.
-- Not located in prisma/migrations: prisma migrate deploy must NOT discover it.
-- Candidate 12th additive migration for B2B credit currency source evidence and
-- append-only human review histories. Requires exact-owner approval, new external
-- encrypted backup, independent Restore, SQL/PostgreSQL verification and a
-- reviewed Prisma schema + migration pair BEFORE any application.
--
-- Source Neon project: stordex-staging, ID dry-feather-14704968
-- Source Neon branch: staging, ID br-sparkling-boat-ao9nrctp
-- Source DB: neondb. CURRENTLY 29 tables, 11 migrations. PRODUCTION EXCLUDED.
-- No financial updates; existing DRAFT/VOID-only CreditNote constraints remain.
--
-- The SQL below is PROPOSED, not executed, not yet proven by CI PostgreSQL.
-- Timestamp columns follow existing Prisma timestamp(3) convention.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Composite referenced keys guarantee tenant ownership in the new tables.
-- Primary IDs already uniquely identify records; composite indexes add
-- multicolumn tenant-aware referential integrity without changing rows.
CREATE UNIQUE INDEX "Invoice_id_tenantId_currencyEvidence_key"
  ON "Invoice"("id","tenantId");
CREATE UNIQUE INDEX "User_id_tenantId_creditReview_key"
  ON "User"("id","tenantId");
CREATE UNIQUE INDEX "B2BCreditNote_id_invoice_seller_creditReview_key"
  ON "B2BCreditNote"("id","originalInvoiceId","sellerTenantId");

-- Immutable uploaded-original evidence header. There is NO trusted source
-- document upload/verification writer in this proposal. Object keys are opaque
-- storage references and must be validated by a future private storage service.
-- One invoice may have multiple evidence versions after reject/revoke; no
-- previous evidence may be edited or deleted. Effective state is EVENT-DERIVED.
CREATE TABLE "B2BInvoiceCurrencyEvidence" (
  "id" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "sourceInvoiceNumber" TEXT NOT NULL,
  "documentObjectRef" TEXT NOT NULL,
  "documentSha256" TEXT NOT NULL,
  "invoiceSnapshotSha256" TEXT NOT NULL,
  "documentExplicitCurrencyCode" TEXT NOT NULL,
  "submittedByUserId" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "B2BInvoiceCurrencyEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "B2BInvoiceCurrencyEvidence_docref_check"
    CHECK (length(btrim("documentObjectRef")) BETWEEN 8 AND 1024),
  CONSTRAINT "B2BInvoiceCurrencyEvidence_invoice_number_check"
    CHECK (length(btrim("sourceInvoiceNumber")) BETWEEN 1 AND 128),
  CONSTRAINT "B2BInvoiceCurrencyEvidence_document_hash_check"
    CHECK ("documentSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "B2BInvoiceCurrencyEvidence_source_hash_check"
    CHECK ("invoiceSnapshotSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "B2BInvoiceCurrencyEvidence_JPY_only_check"
    CHECK ("documentExplicitCurrencyCode" = 'JPY'),
  CONSTRAINT "B2BInvoiceCurrencyEvidence_invoice_seller_fkey"
    FOREIGN KEY ("invoiceId","sellerTenantId")
    REFERENCES "Invoice"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "B2BInvoiceCurrencyEvidence_submitter_seller_fkey"
    FOREIGN KEY ("submittedByUserId","sellerTenantId")
    REFERENCES "User"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "B2BInvoiceCurrencyEvidence_id_invoice_seller_key"
  ON "B2BInvoiceCurrencyEvidence"("id","invoiceId","sellerTenantId");
CREATE UNIQUE INDEX "B2BInvoiceCurrencyEvidence_id_seller_key"
  ON "B2BInvoiceCurrencyEvidence"("id","sellerTenantId");
CREATE INDEX "B2BInvoiceCurrencyEvidence_seller_invoice_idx"
  ON "B2BInvoiceCurrencyEvidence"("sellerTenantId","invoiceId","submittedAt");

-- Reviews and revocations are EVENTS, not a mutable VERIFIED flag.
-- Initial header insertion is PENDING implicitly; review event VERIFIES or
-- REJECTS, and a later REVOKED event permanently invalidates VERIFICATION.
-- New evidence header must be created for any replacement/re-verification.
CREATE TABLE "B2BInvoiceCurrencyEvidenceEvent" (
  "id" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "observedDocumentSha256" TEXT NOT NULL,
  "observedInvoiceSnapshotSha256" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "B2BInvoiceCurrencyEvidenceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "B2BInvoiceCurrencyEvidenceEvent_event_id_key" UNIQUE ("eventId"),
  CONSTRAINT "B2BInvoiceCurrencyEvidenceEvent_kind_check"
    CHECK ("eventType" IN ('VERIFIED','REJECTED','REVOKED')),
  CONSTRAINT "B2BInvoiceCurrencyEvidenceEvent_reason_check"
    CHECK (length(btrim("reason")) BETWEEN 8 AND 500),
  CONSTRAINT "B2BInvoiceCurrencyEvidenceEvent_eventid_uuid_check"
    CHECK ("eventId" ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
  CONSTRAINT "B2BInvoiceCurrencyEvidenceEvent_document_hash_check"
    CHECK ("observedDocumentSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "B2BInvoiceCurrencyEvidenceEvent_source_hash_check"
    CHECK ("observedInvoiceSnapshotSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "B2BInvoiceCurrencyEvidenceEvent_evidence_fkey"
    FOREIGN KEY ("evidenceId","sellerTenantId")
    REFERENCES "B2BInvoiceCurrencyEvidence"("id","sellerTenantId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "B2BInvoiceCurrencyEvidenceEvent_reviewer_fkey"
    FOREIGN KEY ("reviewerUserId","sellerTenantId")
    REFERENCES "User"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "B2BInvoiceCurrencyEvidenceEvent_result_once_idx"
  ON "B2BInvoiceCurrencyEvidenceEvent"("evidenceId")
  WHERE "eventType" IN ('VERIFIED','REJECTED');
CREATE UNIQUE INDEX "B2BInvoiceCurrencyEvidenceEvent_revoke_once_idx"
  ON "B2BInvoiceCurrencyEvidenceEvent"("evidenceId")
  WHERE "eventType" = 'REVOKED';
CREATE INDEX "B2BInvoiceCurrencyEvidenceEvent_timeline_idx"
  ON "B2BInvoiceCurrencyEvidenceEvent"("evidenceId","createdAt","id");

-- Immutable maker/checker review record; NO CreditNote status/amount write.
-- An APPROVED review event is NOT CreditNote issuance or money movement.
-- The future writer MUST server-side recompute the amounts and hashes inside
-- an audited transaction; DB checks below cannot prove authentic originals.
CREATE TABLE "B2BCreditApprovalReviewEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "creditNoteId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "accountingVerifierUserId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "invoiceSnapshotSha256" TEXT NOT NULL,
  "computedAmountsSha256" TEXT NOT NULL,
  "candidateSubtotal" INTEGER NOT NULL,
  "candidateTax" INTEGER NOT NULL,
  "candidateTotal" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "B2BCreditApprovalReviewEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "B2BCreditApprovalReviewEvent_event_id_key" UNIQUE ("eventId"),
  CONSTRAINT "B2BCreditApprovalReviewEvent_eventid_uuid_check"
    CHECK ("eventId" ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
  CONSTRAINT "B2BCreditApprovalReviewEvent_status_check"
    CHECK ("eventType" IN ('REVIEW_ACCEPTED','REVIEW_REJECTED')),
  CONSTRAINT "B2BCreditApprovalReviewEvent_source_hash_check"
    CHECK ("invoiceSnapshotSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "B2BCreditApprovalReviewEvent_amount_hash_check"
    CHECK ("computedAmountsSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "B2BCreditApprovalReviewEvent_amounts_check"
    CHECK ("candidateSubtotal" >= 0 AND "candidateTax" >= 0 AND
           "candidateTotal" >= 0 AND
           "candidateSubtotal"::BIGINT + "candidateTax"::BIGINT =
              "candidateTotal"::BIGINT),
  CONSTRAINT "B2BCreditApprovalReviewEvent_reason_check"
    CHECK (length(btrim("reason")) BETWEEN 8 AND 500),
  CONSTRAINT "B2BCreditApprovalReviewEvent_credit_note_fkey"
    FOREIGN KEY ("creditNoteId","invoiceId","sellerTenantId")
    REFERENCES "B2BCreditNote"("id","originalInvoiceId","sellerTenantId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "B2BCreditApprovalReviewEvent_evidence_fkey"
    FOREIGN KEY ("evidenceId","invoiceId","sellerTenantId")
    REFERENCES "B2BInvoiceCurrencyEvidence"("id","invoiceId","sellerTenantId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "B2BCreditApprovalReviewEvent_reviewer_fkey"
    FOREIGN KEY ("reviewerUserId","sellerTenantId")
    REFERENCES "User"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "B2BCreditApprovalReviewEvent_accounting_fkey"
    FOREIGN KEY ("accountingVerifierUserId","sellerTenantId")
    REFERENCES "User"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
-- Exactly one independent decision per CreditNote; any subsequent new monetary
-- proposal requires a new CreditNote rather than mutating review history.
CREATE UNIQUE INDEX "B2BCreditApprovalReviewEvent_decision_once_idx"
  ON "B2BCreditApprovalReviewEvent"("creditNoteId");
CREATE INDEX "B2BCreditApprovalReviewEvent_seller_invoice_idx"
  ON "B2BCreditApprovalReviewEvent"("sellerTenantId","invoiceId","createdAt");

CREATE FUNCTION stordex_deny_credit_evidence_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $ledger_deny$
BEGIN
  RAISE EXCEPTION 'Credit evidence and approval audit ledger is append-only';
END;
$ledger_deny$;

-- Evidence header: validate seller and original invoice at creation time.
CREATE FUNCTION stordex_guard_currency_evidence_insert()
RETURNS trigger LANGUAGE plpgsql AS $currency_header$
DECLARE
  source_invoice RECORD;
  uploader RECORD;
BEGIN
  SELECT "tenantId","invoiceNumber",status::text INTO source_invoice
    FROM "Invoice" WHERE id=NEW."invoiceId" FOR SHARE;
  IF NOT FOUND OR source_invoice."tenantId" IS DISTINCT FROM NEW."sellerTenantId" OR
     source_invoice."invoiceNumber" IS DISTINCT FROM NEW."sourceInvoiceNumber" OR
     source_invoice.status NOT IN ('ISSUED','PAID') THEN
    RAISE EXCEPTION 'Currency evidence requires same-seller issued/paid source invoice';
  END IF;
  SELECT u."tenantId",u.role::text AS role,t.status::text AS tenant_status
    INTO uploader FROM "User" u JOIN "Tenant" t ON t.id=u."tenantId"
    WHERE u.id=NEW."submittedByUserId";
  IF NOT FOUND OR uploader."tenantId" IS DISTINCT FROM NEW."sellerTenantId" OR
     uploader.role NOT IN ('OWNER','ADMIN') OR
     uploader.tenant_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Currency evidence requires active seller administrator';
  END IF;
  NEW."submittedAt" := clock_timestamp();
  RETURN NEW;
END;
$currency_header$;
CREATE TRIGGER "B2BInvoiceCurrencyEvidence_insert_guard"
  BEFORE INSERT ON "B2BInvoiceCurrencyEvidence"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_currency_evidence_insert();

-- Each verification/rejection/revocation is ordered with a row-level lock,
-- preventing concurrent reviewers from both writing a first decision.
CREATE FUNCTION stordex_guard_currency_evidence_event_insert()
RETURNS trigger LANGUAGE plpgsql AS $currency_event$
DECLARE
  source_evidence RECORD;
  reviewer RECORD;
  prior_event TEXT;
BEGIN
  SELECT * INTO source_evidence FROM "B2BInvoiceCurrencyEvidence"
    WHERE id=NEW."evidenceId" AND "sellerTenantId"=NEW."sellerTenantId"
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Currency evidence missing'; END IF;
  SELECT u."tenantId",u.role::text AS role,t.status::text AS tenant_status
    INTO reviewer FROM "User" u JOIN "Tenant" t ON t.id=u."tenantId"
    WHERE u.id=NEW."reviewerUserId";
  IF NOT FOUND OR reviewer."tenantId" IS DISTINCT FROM NEW."sellerTenantId" OR
     reviewer.role NOT IN ('OWNER','ADMIN') OR
     reviewer.tenant_status IS DISTINCT FROM 'ACTIVE' OR
     NEW."reviewerUserId" = source_evidence."submittedByUserId" THEN
    RAISE EXCEPTION 'Currency review requires independent active seller administrator';
  END IF;
  IF NEW."observedDocumentSha256" IS DISTINCT FROM source_evidence."documentSha256" OR
     NEW."observedInvoiceSnapshotSha256" IS DISTINCT FROM
       source_evidence."invoiceSnapshotSha256" THEN
    RAISE EXCEPTION 'Original document/source hash mismatch';
  END IF;
  SELECT "eventType" INTO prior_event FROM "B2BInvoiceCurrencyEvidenceEvent"
    WHERE "evidenceId"=NEW."evidenceId"
    ORDER BY "createdAt" DESC,"id" DESC LIMIT 1;
  IF NEW."eventType" IN ('VERIFIED','REJECTED') AND prior_event IS NOT NULL THEN
    RAISE EXCEPTION 'Currency evidence already reviewed';
  END IF;
  IF NEW."eventType"='REVOKED' AND prior_event IS DISTINCT FROM 'VERIFIED' THEN
    RAISE EXCEPTION 'Only an independently verified evidence can be revoked';
  END IF;
  NEW."createdAt" := clock_timestamp();
  RETURN NEW;
END;
$currency_event$;
CREATE TRIGGER "B2BInvoiceCurrencyEvidenceEvent_insert_guard"
  BEFORE INSERT ON "B2BInvoiceCurrencyEvidenceEvent"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_currency_evidence_event_insert();

-- A decision stays an audit record, never a state transition. The original
-- amount hash is not verifiable in SQL alone: future writer must recompute it
-- from trusted Invoice+Order+line snapshots inside serializable transaction.
CREATE FUNCTION stordex_guard_credit_approval_review_insert()
RETURNS trigger LANGUAGE plpgsql AS $credit_review$
DECLARE
  credit RECORD;
  original_invoice RECORD;
  reviewer RECORD;
  accountant RECORD;
  evidence RECORD;
  latest_event TEXT;
BEGIN
  SELECT * INTO credit FROM "B2BCreditNote"
    WHERE id=NEW."creditNoteId" AND "sellerTenantId"=NEW."sellerTenantId"
      AND "originalInvoiceId"=NEW."invoiceId" FOR UPDATE;
  IF NOT FOUND OR credit.status IS DISTINCT FROM 'DRAFT'::"B2BCreditStatus" OR
     credit."proposedSubtotal" IS NOT NULL OR credit."proposedTax" IS NOT NULL OR
     credit."proposedTotal" IS NOT NULL THEN
    RAISE EXCEPTION 'Review can only describe an unissued non-financial DRAFT';
  END IF;
  SELECT * INTO original_invoice FROM "Invoice"
    WHERE id=NEW."invoiceId" AND "tenantId"=NEW."sellerTenantId" FOR SHARE;
  IF NOT FOUND OR original_invoice.status NOT IN ('ISSUED','PAID') OR
     NEW."candidateTotal" > original_invoice.total THEN
    RAISE EXCEPTION 'Review amount exceeds original issued invoice';
  END IF;
  SELECT * INTO evidence FROM "B2BInvoiceCurrencyEvidence"
    WHERE id=NEW."evidenceId" AND "sellerTenantId"=NEW."sellerTenantId"
      AND "invoiceId"=NEW."invoiceId" FOR SHARE;
  IF NOT FOUND OR NEW."invoiceSnapshotSha256" IS DISTINCT FROM
      evidence."invoiceSnapshotSha256" THEN
    RAISE EXCEPTION 'Review invoice hash/evidence mismatch';
  END IF;
  SELECT "eventType" INTO latest_event FROM "B2BInvoiceCurrencyEvidenceEvent"
    WHERE "evidenceId"=NEW."evidenceId"
    ORDER BY "createdAt" DESC,"id" DESC LIMIT 1;
  IF latest_event IS DISTINCT FROM 'VERIFIED' THEN
    RAISE EXCEPTION 'Credit review requires verified and non-revoked JPY evidence';
  END IF;
  SELECT u."tenantId",u.role::text AS role,t.status::text AS tenant_status
    INTO reviewer FROM "User" u JOIN "Tenant" t ON t.id=u."tenantId"
    WHERE u.id=NEW."reviewerUserId";
  SELECT u."tenantId",u.role::text AS role,t.status::text AS tenant_status
    INTO accountant FROM "User" u JOIN "Tenant" t ON t.id=u."tenantId"
    WHERE u.id=NEW."accountingVerifierUserId";
  IF reviewer."tenantId" IS DISTINCT FROM NEW."sellerTenantId" OR
     reviewer.role NOT IN ('OWNER','ADMIN') OR
     reviewer.tenant_status IS DISTINCT FROM 'ACTIVE' OR
     accountant."tenantId" IS DISTINCT FROM NEW."sellerTenantId" OR
     accountant.role NOT IN ('OWNER','ADMIN') OR
     accountant.tenant_status IS DISTINCT FROM 'ACTIVE' OR
     NEW."reviewerUserId"=credit."createdByUserId" OR
     NEW."accountingVerifierUserId"=credit."createdByUserId" THEN
    RAISE EXCEPTION 'Credit review requires independent active seller managers';
  END IF;
  -- No final issued credit may be inferred from this record. No credit header
  -- update, invoice update, stock movement or settlement occurs in this SQL.
  NEW."createdAt" := clock_timestamp();
  RETURN NEW;
END;
$credit_review$;
CREATE TRIGGER "B2BCreditApprovalReviewEvent_insert_guard"
  BEFORE INSERT ON "B2BCreditApprovalReviewEvent"
  FOR EACH ROW EXECUTE FUNCTION stordex_guard_credit_approval_review_insert();

-- Header and event histories cannot be amended or erased.
CREATE TRIGGER "B2BInvoiceCurrencyEvidence_immutable"
  BEFORE UPDATE OR DELETE ON "B2BInvoiceCurrencyEvidence"
  FOR EACH ROW EXECUTE FUNCTION stordex_deny_credit_evidence_ledger_mutation();
CREATE TRIGGER "B2BInvoiceCurrencyEvidenceEvent_immutable"
  BEFORE UPDATE OR DELETE ON "B2BInvoiceCurrencyEvidenceEvent"
  FOR EACH ROW EXECUTE FUNCTION stordex_deny_credit_evidence_ledger_mutation();
CREATE TRIGGER "B2BCreditApprovalReviewEvent_immutable"
  BEFORE UPDATE OR DELETE ON "B2BCreditApprovalReviewEvent"
  FOR EACH ROW EXECUTE FUNCTION stordex_deny_credit_evidence_ledger_mutation();

COMMIT;
