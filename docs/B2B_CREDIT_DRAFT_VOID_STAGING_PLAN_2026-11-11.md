# B2B CreditNote DRAFT → VOID / allocation release — unapplied design

## Baseline (read-only at 2026-11-11)
- **Neon project:** `stordex-staging` — ID `dry-feather-14704968`.
- **Neon branch:** `staging` — ID `br-sparkling-boat-ao9nrctp`.
- **Database:** `neondb`.
- Source Git staging SHA `b72a63e1120612531dc84787f7d9fdace4ec1b99`.
- 28 public tables, 10 completed Prisma migrations, 1 ISSUED Invoice `I-202611-0001`, 1 CreditNote DRAFT `cmwbh3b5z000008kz8t5ii32x` / `CN-ed938189-de58-4b7e-bc92-58535e7cb0fa`, one original line reserving **2 of 2** physically inspected units.
- 2 formal status audit events, 2 physical events, 24 inventory movements, buyer stock 36 and seller stock 138.
- Four Preview `staging` scoped Vercel switches are all OFF. Production untouched.

## Phase 1: Audited cancellation (this PR; UNAPPLIED migration)
- Adds an **eleventh Prisma migration** `20261111110000_b2b_credit_draft_void_and_audit` for a **new** `B2BCreditVoidEvent` append-only table; `voidEventId`, `voidedAt`, `voidedByUserId`, `voidReason` fields on the original CreditNote; active seller ADMIN/OWNER immutable audit and one-time DRAFT→VOID guard.
- Original credit header/line are **not deleted**. The old DRAFT-only constraint is replaced by strict `DRAFT/VOID` guard. Non-DRAFT accounting statuses `RECONCILED`, `ISSUED`, `APPLIED` remain **prohibited by the DB**.
- Exactly one non-VOID allocation counts against the physically inspected-unit budget. The original line remains for history and doesn't reserve quantity once its note is VOID.
- Original source invoice/seller order/return provenance remains immutable. No credit number reuse, source invoice mutation, payment, tax calculation or refund.
- PostgreSQL `AFTER UPDATE` trigger inserts a matching audit event **in the same transaction** as the status change; append guard refuses UPDATE or DELETE of events and direct mismatched insert.
- Caller: active seller OWNER/ADMIN with 8–500 char reason and UUID idempotency event. Same exact UUID/actor/reason can replay as a no-op; a different attempt on an already VOID note is rejected.
- Serializable application locks taken in source order: buyer PO → trading connection → return → sorted source return items → original Invoice → credit header. Database line trigger also locks source return items and ignores VOID allocations. Concurrent void and new draft cannot silently over-allocate.
- Web action/button behind **two** exact branch-limited, default-OFF flags: `STORDEX_B2B_CREDIT_DRAFT_ENABLED` AND `STORDEX_B2B_CREDIT_VOID_ENABLED`. The four pre-existing B2B flags remain OFF unless separately authorized.

## Preconditions before ever merging/applying to live Staging
1. **Do not apply migration now.** It has NOT been separately authorized for live Staging.
2. Run the new private **GPG AES256 encrypted** backup of current **28-table/10-migration/1-invoice/1-credit** Staging on the correct project/branch/database. Preserve and independently check the encrypted archive and SHA-256. Do not commit credentials or archive.
3. Restore archive to a **new empty database in separate recovery-test project**; independently confirm all original tables/rows/record content, FKs, indexes, triggers, migration checksums and credit quantities.
4. Obtain explicit owner approval for this **eleventh** schema migration only. Then apply exact reviewed SQL transactionally and verify original CreditNote remains DRAFT with 2 units allocated (no implicit VOID).
5. CI disposable PostgreSQL must pass all 11 migration applications, schema drift, typecheck, unit/integration, Vercel READY. Only after real Staging DB is migrated may source PR be merged/deployed with all UI flags still OFF.
6. Obtain separate explicit permission for performing ONE live Staging VOID operation on the original 2-box DRAFT. With an approved UAT: temporarily enable only the required 2 flags at Vercel Preview staging gitBranch, redeploy exact Staging source and alias; verify seller admin visible and buyer/STAFF not authorized. Record one void reason/UUID, then check exactly one append-only event, original line preserved, active inspected budget **2 restored**, original invoice ¥4,840 and inventories 36/138 unchanged.
7. Disable both new UI flags, redeploy & alias to the OFF build, and independently audit state again.
8. No Production release until feature completion and comprehensive whole-repository Codex Astra Review PASS.

## Later phases — NOT authorized by this PR
- Tax breakdown and rounding policy for invoice with `taxPerOrder=true/false`, different tax rates, multiple invoices/orders and a partial return. Existing Invoice has no currency provenance; drafts currently JPY only.
- Read-only proposed amount model, then authorized monetary approval with **four eyes**, quantity and yen caps, exact tax summation and tracked audit.
- Legal credit issuance, payment/refund/offset, customer notification, reconciliation, refunds and rollback rules need separate design / approval / migrations. A DRAFT or VOID by itself has **zero financial effect**.

## Known migration issue to review
- Because this release replaces two existing database trigger functions in addition to adding a table, every state guard, event trigger, FK and quantity allocation race must PASS on disposable PostgreSQL **before** requesting user migration approval. No direct SQL manipulation of production or staging fixtures is permitted.
