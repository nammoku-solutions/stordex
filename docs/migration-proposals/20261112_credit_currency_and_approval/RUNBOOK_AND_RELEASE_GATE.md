# Proposed 12th Stordex Migration — release gate (NOT APPROVED / NOT APPLIED)

Prepared: 2026-11-12. Scope: original invoice JPY evidence, immutable evidence decisions/revocations, and immutable maker/checker accounting review audit metadata. This is a **draft-only schema**, not a financial adjustment workflow.

## Exact infrastructure and safety boundary

| Purpose | Project name / ID | Branch name / ID | Database |
|---|---|---|---|
| Source Staging to protect | **stordex-staging** / **dry-feather-14704968** | **staging** / **br-sparkling-boat-ao9nrctp** | **neondb** |
| Existing independent recovery project | **stordex-recovery-test** / **delicate-rice-23940930** | **production** / **br-ancient-voice-aoutl8qq** (**NOT actual Production**) | Existing old snapshot: stordex_restore_post_credit_20261111 |
| Future fresh independent Restore | **stordex-recovery-test** / **delicate-rice-23940930** | **production** / **br-ancient-voice-aoutl8qq** (**NOT actual Production**) | New uniquely named restored DB; never overwrite old snapshot |

Production is the future AWS Tokyo rollout, not either Neon branch named production. No Production changes here. The source Neon Staging staging branch is NOT the default/root production branch in the source project; every command must explicitly select source project ID, branch ID and database.

Baseline: 29 public tables, **11** completed Prisma migrations, 1 historical VOID CreditNote, 1 immutable VOID audit event, 2 released inspected units, 0 active credit allocation, original invoice I-202611-0001 at JPY 4,840, 24 inventory movements, buyer stock 36, seller stock 138. All six Staging B2B feature switches OFF.

## What the proposed SQL DOES / does NOT do

- Source draft file: 001_additive_schema_DRAFT_DO_NOT_APPLY.sql, stored under docs/migration-proposals, explicitly NOT under prisma/migrations and not discoverable by prisma migrate deploy.
- Three new tables: B2BInvoiceCurrencyEvidence, B2BInvoiceCurrencyEvidenceEvent, B2BCreditApprovalReviewEvent.
- Only additive composite unique indexes on existing parent tables for tenant-aware foreign keys; original 29 tables' existing rows are not rewritten.
- New immutable evidence/evidence-decision/review audit tables. Verification, rejection and revocation are events, not mutable status columns. A reviewer must be a DIFFERENT active-seller OWNER/ADMIN from the submitter. An approval reviewer and accounting verifier must be DIFFERENT from the CreditNote maker. Trigger uses parent-row locks to serialize evidence revocation against prospective reviews.
- Proposed review amounts and hashes are *future hypothetical audit payloads*, not an application approval action. There is no server writer/route/form in this PR.
- **Keep existing B2BCreditNote DRAFT-or-VOID-only check and VOID audit trigger intact.** No new issued/approved credit status. No invoice update, refund, settlement, inventory change, or payment.
- The database can validate digest shape and referential integrity, **not cryptographically prove original bytes were reviewed**. Future authenticated storage/inspection and trusted hash recomputation are required.

### Known design limits needing review BEFORE a real DB application

1. The existing User model has OWNER/ADMIN/STAFF but no per-user active/disabled flag. The draft SQL verifies tenant ACTIVE and seller OWNER/ADMIN roles, **not a nonexistent User.active field**. Decide whether user deactivation/account state must be separately modeled.
2. The underlying Invoice model has no currency code. Do not backfill it as JPY by default. Immutable historical evidence must be verified against an actual original document, not a UI checkbox.
3. Verify effective audit signing authority, storage retention/permissions, deletion requests, source invoice corrections, tax-rate splits/qualified return invoice, discounts, multi-credit caps and accounting/issuer boundaries before implementing any writer.
4. Test concurrency for verify-vs-revoke, duplicate event, same user as maker/reviewer, partner/seller mismatch, invalid hash, and altered original invoice across transactions in a **disposable PostgreSQL** target.
5. Check the proposed Prisma models/migration schema for drift. This SQL draft is not a compiled/applicable Prisma migration until a separate reviewed release PR is prepared.

## Gate A — design / CI (authorized now)

- [x] Read source schema and current staging baseline.
- [x] Author draft SQL **outside** prisma/migrations.
- [x] Author read-only source preflight and post-migration checks.
- [ ] CI static guards, typecheck and tests PASS.
- [ ] DB-specific DDL rehearsal on disposable PostgreSQL (NOT Staging).
- [ ] Finalize model relations in prisma/schema.prisma **in a separately authorized real-migration PR**.
- [ ] Accounting review of policy and immutable document provenance.

## Gate B — fresh backup and independent Restore (separate permission required)

Run this gate ONLY after the owner approves the specific next Staging migration proposal.

1. Identify target as Neon **dry-feather-14704968** / **br-sparkling-boat-ao9nrctp** / **neondb**. Verify current Git staging commit, migration ledger, tenant counts and source query 002_preflight_READ_ONLY.sql. Reject if target differs.
2. Create a **fresh encrypted logical backup of source Staging branch**; record source branch ID, backup UTC, SHA-256 ciphertext and GPG decryption verification evidence. Do not disclose credentials or put plaintext in GitHub/CI/logs. A Neon same-project branch/snapshot alone is not an independent external backup.
3. Restore to a **new** DB inside separate recovery project **delicate-rice-23940930** / branch **br-ancient-voice-aoutl8qq** (its name production is just a branch name, NOT Production). Never overwrite existing recovery DB. If permissions/quota prevent a new DB/branch, STOP rather than delete archived branches without approval (Issue #109).
4. At the same logical snapshot, compare **all 29 existing table row counts and normalized-content hashes**, 11 original migration records and checksums, tenant-scope totals, credit/return/invoice/stock invariants. Abort on ANY mismatch.
5. Exercise the draft SQL (after it becomes a real reviewed Prisma migration) on a **separate disposable rehearsal copy only**, and test SQL constraints, immutable events, FKs, duplicate submissions, role changes and verify/revoke race. Capture rollback strategy and independent restore evidence.

## Gate C — real Staging application (SECOND explicit, exact-target authorization)

Do NOT infer approval from this preparation PR or from GitHub CI success.

The approval message must identify:
- source Neon project **stordex-staging (dry-feather-14704968)**;
- source Neon branch **staging (br-sparkling-boat-ao9nrctp)**;
- database **neondb**;
- exact reviewed migration name, Git SHA, SQL checksum and expected table/migration counts;
- timestamp and independent Restore validation PASS.

Only then apply the EXACT reviewed migration in one transaction (or audited migration-tool workflow) to Staging and mark the checksum-identical _prisma_migrations history once. Never manually rerun an already-applied migration.

Use 003_postcheck_READ_ONLY_AFTER_APPROVAL.sql after applying:
- expected **32** public tables, **12** completed migrations, 0 incomplete;
- **three new empty ledgers**, **six new triggers**, all tenant-safe FKs;
- preserved existing B2BCreditNote_draft_or_void_only_check and VOID audit protections;
- exact same original 29 tables' row counts/content hashes, original 11 migration histories, credit/invoice/stock contents;
- 6 existing B2B Staging flags remain OFF. Any evidence/review writer requires a further UAT approval.

If postcheck fails, STOP. Do not issue a destructive schema rollback against populated Staging; use transaction rollback for unapplied work, then an approved forward fix or carefully authorized encrypted-backup Restore. Store audit artifacts privately.

## Gate D — future workflows, NOT part of Migration #12

- Implement encrypted original Invoice document capture and strict authorized verification; immutable source snapshot and document hashes server-side; no public object URLs.
- New app-side evidence and decision event writers using serializable transactions and DB row locks, idempotency keys and audit; separately feature-gated.
- Recompute credit tax/amounts using existing pure calculator and independent accountant approval. Define Japanese qualified return-invoice requirements and source-amount mismatch policy before enabling monetary fields.
- Separate approval for financial amount persistence, credit issuance and payments/refunds/offsets; full UAT and tenant isolation. No Production until all functions complete and full Codex Astra review PASS.

## Expected backup/Restore workload

**For this actual 12th migration, once approved: one fresh encrypted source backup + one independent Restore + one disposable migration rehearsal;** additional restoration exercises only on failures or if the source changes materially before apply. No new backup/Restore for every source-only PR or preview UAT. Future schema-changing migrations may need their own fresh single pair.

**Current status: only Gate A SQL and runbook drafting.** No backup created, Restore run, database migration applied, flag enabled, financial adjustment, or Production work.
