# Proposed 12th Stordex Migration — release gate (NOT APPROVED / NOT APPLIED)

Prepared: 2026-11-12. Scope: original invoice JPY evidence, immutable evidence decisions/revocations, and immutable maker/checker accounting review audit metadata. This is a **draft-only schema**, not a financial adjustment workflow.

## Exact infrastructure and safety boundary

| Purpose | Project name / ID | Branch name / ID | Database |
|---|---|---|---|
| Source Staging to protect | **stordex-staging** / **dry-feather-14704968** | **staging** / **br-sparkling-boat-ao9nrctp** | **neondb** |
| Existing independent recovery project | **stordex-recovery-test** / **delicate-rice-23940930** | **production** / **br-ancient-voice-aoutl8qq** (**NOT actual Production**) | Existing old snapshot: stordex_restore_post_credit_20261111 |
| Future fresh independent Restore | **stordex-recovery-test** / **delicate-rice-23940930** | **production** / **br-ancient-voice-aoutl8qq** (**NOT actual Production**) | New uniquely named restored DB; never overwrite old snapshot |

Production is the future AWS Tokyo rollout, not either Neon branch named production. No Production changes here. The source Neon Staging staging branch is NOT the default/root production branch in the source project; every command must explicitly select source project ID, branch ID and database.

Baseline: 29 public tables, **11** completed Prisma migrations, 1 historical VOID CreditNote, 1 immutable VOID audit event, and 2 active units in one new amount-free DRAFT after the two-unit Staging reallocation UAT, original invoice I-202611-0001 at JPY 4,840, 24 inventory movements, buyer stock 36, seller stock 138. All six Staging B2B feature switches OFF.

## What the proposed SQL DOES / does NOT do

- Source draft file: 001_additive_schema_DRAFT_DO_NOT_APPLY.sql, stored under docs/migration-proposals, explicitly NOT under prisma/migrations and not discoverable by prisma migrate deploy.
- Three new tables: B2BInvoiceCurrencyEvidence, B2BInvoiceCurrencyEvidenceEvent, B2BCreditApprovalReviewEvent.
- Only additive composite unique indexes on existing parent tables for tenant-aware foreign keys; original 29 tables' existing rows are not rewritten.
- New immutable evidence/evidence-decision/review audit tables. A submission stores the seller/invoice-scoped object key, exact S3 version ID, byte length and SHA-256 without claiming a currency. Only a separate VERIFIED event records observed JPY; rejection and revocation cannot assert verified currency. Verification, rejection and revocation are events, not mutable status columns. A reviewer must be a DIFFERENT active-seller OWNER/ADMIN from the submitter. An approval reviewer and accounting verifier must be DIFFERENT from the CreditNote maker. Trigger uses parent-row locks to serialize evidence revocation against prospective reviews.
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
- [x] CI static guards, typecheck, tests, build and dependency audit PASS (GitHub Actions #1146).
- [x] Initial draft DDL/security and concurrent-evidence-review rehearsal PASS on disposable PostgreSQL 16 (CI #1146: 3 tables, 6 triggers, 19 assertions).
- [x] Synthetic buyer/seller order, inspected return, DRAFT allocation and non-posting CreditNote review event; review-before-revoke and revoke-before-review concurrency (GitHub Actions #1160).
- [x] Stale original Invoice financial snapshot, seller maker/checker, accounting signoff, cross-tenant and over-original-amount rejection in disposable PostgreSQL (GitHub Actions #1160).
- [x] Prisma 7 CLI introspection of all 3 new models/relations on disposable PostgreSQL, WITHOUT modifying prisma/schema.prisma (GitHub Actions #1160).
- [x] CI-only Invoice UPDATE-vs-review race test, expected financial snapshot invalidation, and CANCELLED Invoice rejection added (#162, subject to CI).
- [x] Pure canonical server-side Invoice/Order/OrderItem financial snapshot hash and trust-bound file byte/digest comparison with unit tests added (#162, subject to CI).
- [ ] Still outstanding before real Staging migration approval: **authenticated original invoice bytes in protected immutable storage**, evidence uploader/reviewer authorization, real Prisma model/migration pair, and accounting/security signoff. Neither hash comparison nor historical acceptance authorizes issuing money.
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


## Disposable PostgreSQL CI rehearsal evidence — 2026-11-12

- PR #160, GitHub Actions run #1146, job 131008268683: SUCCESS.
- PostgreSQL 16 disposable service on localhost:5432/stordex. Source: only 11 committed Prisma migrations. The service is destroyed after the job.
- Runner: scripts/ci-rehearse-credit-migration12.mjs, blocked outside CI=true/GITHUB_ACTIONS=true/APP_ENV=ci and exact localhost PostgreSQL identity.
- Real DDL execution PASS: 3 proposed audit tables, 6 guards; migration count remains 11; the SQL was not installed in prisma/migrations.
- 19 assertions include foreign tenant and STAFF rejection, USD rejection, self-review rejection, checksum mismatch, duplicate verification/revocation denial, immutable source/events, concurrent independent reviewers (exactly one commits), and missing-credit decision denial.
- **Not yet covered**: successful review event with a complete synthetic B2B return/CreditNote, review-vs-revocation/Invoice status race, original document byte authentication. CI success does not authorize any actual Staging SQL application.


## Extended CI approval/race/Prisma evidence — 2026-11-12

- PR #161, GitHub Actions #1160 job 131015130268: full workflow SUCCESS.
- Existing 19 CI evidence/immutability assertions PASS, plus 19 additional cases with **fully synthetic seller/buyer order, PO receipt, inspected returns, CreditNote DRAFT quantity line**, review audit and concurrent evidence revocation.
- Deterministic race A: evidence revocation commits first, waiting review **fails**, no approval audit inserted. Race B: review audit commits first and later evidence revocation succeeds; historical review is preserved but no financial posting or status transition becomes allowed.
- Original Invoice snapshot changed after DRAFT creation causes review rejection; currency mismatch, self-review, accounting maker self-signoff, foreign seller and over-original-total cases reject before first legitimate approval, to prevent unique-index failures hiding authorization bugs.
- Prisma 7 db pull --print introspects the proposed ledger tables and relation fields from disposable PostgreSQL; original prisma/schema.prisma was not modified. This is **an introspection rehearsal, not an approved Prisma model/migration implementation**.
- New audit tables exist only in throwaway CI PostgreSQL; Neon Staging remains **stordex-staging** / **dry-feather-14704968**, branch **staging** / **br-sparkling-boat-ao9nrctp**, database **neondb**. Unapplied SQL is still outside prisma/migrations.
- Unresolved: original invoice bytes cannot be authenticated by database hash shape; need private source-document verification, authentic reviewer identity and source timestamp, live concurrency test for Invoice edits, defined policy for revoking evidence after accepted audit and future real financial issuance. This is NOT permission to migrate or issue.


## Invoice fingerprint and source-update race extension

- See `SOURCE_INTEGRITY_DESIGN.md` for the v1 deterministic financial fingerprint and private-file byte digest match contract. They are pure functions; no approved evidence exists on Staging.
- The CI extension distinguishes Invoice-change-wins (blocked review), review-wins (later Invoice edit invalidates any prospective issue), and cancellation (blocked review) on disposable PostgreSQL only. The accepted audit is historical, NOT posting permission.
- No changes to prisma/schema.prisma or real Prisma migrations. All six Staging B2B flags remain OFF. The 12th migration SQL proposal remains unapproved and outside automatic migration discovery.
