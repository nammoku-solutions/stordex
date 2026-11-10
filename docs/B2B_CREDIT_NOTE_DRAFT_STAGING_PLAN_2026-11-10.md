# B2B CreditNote DRAFT-only ledger — 2026-11-10 (Issue #82)

**DRAFT PR. DO NOT MERGE OR APPLY MIGRATION TO LIVE NEON STAGING/PRODUCTION.** Requires another encrypted backup, independently verified restore and **separate approval for exactly** `20261110170000_b2b_credit_note_drafts`.

## Current proven source data

- Staging Git SHA `8f7f873613ee2bc74b6980a8d7a1999742c28909`.
- Staging Neon project `dry-feather-14704968`, branch `br-sparkling-boat-ao9nrctp`, DB `neondb`.
- **26 tables, nine applied migrations**, 2 immutable B2BReturnStockEvents, 2 immutable B2BReturnStatusEvents, 24 InventoryMovements.
- UAT `P-20261110-0001`: request `cmwa55eah000008jsfs3r5dwk` now **INSPECTED**; 3 requested, 2 approved/physically inspected; 1 saleable + 1 unsaleable; buyer stock 36 and seller stock 138.
- **Invoice = 0, InvoiceOrder = 0.** This data is **not credit-eligible yet**. Do not fabricate an issued/paid invoice in the migration to make it eligible.
- All three B2B UAT flags OFF in Vercel Preview scoped to `staging`, production untouched.

## Isolated tenth schema migration

`prisma/migrations/20261110170000_b2b_credit_note_drafts/migration.sql` is newly ordered **after** the ninth audit migration; the original unmerged Draft #121 filename `20261105113000...` must NOT be deployed or merged into current staging.

It adds two additive DB tables:
- **B2BCreditNote** — seller-owned, original Invoice + InvoiceOrder linked to exact seller Order, same inspected ReturnRequest, immutable original invoice subtotal/tax/total/rate/taxPerOrder snapshot, explicit ISO-like three-letter currency, creator and optional **non-authoritative** proposed amounts.
- **B2BCreditNoteLine** — exact ReturnItem line + linked ReturnRequest, claimed inspected quantity; composite FKs and explicit row lock prevent cross-return allocations and over-allocation across separate Draft headers.

PostgreSQL guard functions:
- Reject status other than **DRAFT** on insert/update, and any delete. Future enum labels do NOT authorize issuance.
- Verify seller tenant, active OWNER/ADMIN creator, original issued/paid Invoice, immutable invoice snapshot, exact seller Order billed on invoice.
- Permit no more total Draft allocations on a return item than actual inspected physical quantities. Immutable credit source/quantity, no issuing/applying/refunding.
- Header and line nullable `proposedSubtotal/proposedTax/proposedTotal` deliberately avoid pretending automatic tax reconciliation is legally correct.

## Internal service and validation

- `createB2BCreditNoteDraft` (unexposed from Server Actions/routes) accepts seller OWNER/ADMIN, active TradingConnection, linked seller Order and issued/paid invoice; **requires formally INSPECTED ReturnRequest**.
- Serialized lock order buyer PO → TradingConnection → ReturnRequest → sorted return lines → original Invoice; SERIALIZABLE transaction with bounded conflict retries and idempotency-key-based tenant-unique Draft number.
- Matched source Invoice, tenant, source seller Order, physically INSPECTED quantities and prior allocations are rechecked server-side before commit. No proposed monetary amounts, no changes to Invoice or stock or payments.
- Pure `assessCreditDraftReadiness` and tests report the current UAT blocked by missing original issued Invoice, incorrect seller/source association, invalid quantities and already allocated units.
- All writes in integration tests use disposable local PostgreSQL from CI, not live Neon.

## Financial/legal decisions NOT addressed by this feature

- Exact currency/minor unit support (Invoice currently has no currency column).
- Invoice tax mode and per-line/per-order tax rounding, partial quantities/discounts, tax law jurisdiction.
- Original invoice outstanding vs already PAID; whether to refund or credit a future invoice is a separate authorized action.
- Cap of cumulative **issued/applied monetary credit** vs original invoice total and payment balance (not just inspected-unit Draft allocations).
- Four-eyes review, legal note numbering, immutable issuance, settlement/offset ledger, VOID/reversal, export/PDF, notifications.
- Current Draft allocations consume inspected units and are immutable even if a draft is abandoned; a separate controlled VOID/release policy is required before public UI enablement. No user-facing ability to create Drafts in this PR.

## Release gates

1. Disposable CI: Prisma 10 migrations and schema drift, PostgreSQL FK/trigger tests, tenant/role/retry/race tests, TypeScript, Next build, dependency audit.
2. Before any live Staging migration: run **unexecuted** `scripts/backup-neon-staging-post-status-audit.sh --check` then `--execute` in user's WSL to generate private AES256 GPG; verify SHA256 and TOC. Script pins 26 tables/9 migrations, two status events, two physical events, 24 movements, 0 invoices and INSPECTED status.
3. Restore that archive into **new empty** DB on independent `stordex-recovery-test`, never overwrite existing recovery DB; compare all 26 table rows/hashes, DDL/types/indexes/constraints/triggers and nine Prisma histories.
4. Request **separate explicit owner consent** for applying *only* `20261110170000_b2b_credit_note_drafts` on Neon Staging after independent restore PASS. Apply SQL and Prisma checksum atomically, verify postconditions.
5. Merge only source SQL/Prisma/schema tests into Staging after CI; then separately release internal draft service with any remaining fixes, default-OFF UI and audited UAT. Existing UAT has **no Invoice**, so arrange an authorized issued-invoice browser fixture after approved DB foundation.
6. Do NOT rebase/merge the old stacked Draft PRs #121/#123/#128/#130 wholesale. They include unapproved migrations and later finance concepts.
7. Final **Codex Astra comprehensive review** before any Production deployment.

**No Production change, no live Invoice or financial mutation, and no live Staging DB migration has occurred as part of this PR.**
