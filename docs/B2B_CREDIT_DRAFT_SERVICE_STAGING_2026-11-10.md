# CreditNote DRAFT internal service — Staging code-only release (2026-11-10)

## Scope
- Built on **Staging** Git commit `90a0c0fdfdd22d7b442e556483c4f1301dc8e0a3`. Owner-approved tenth CreditNote DRAFT schema migration is already applied to **Neon project `stordex-staging` (project `dry-feather-14704968`), branch `staging` (branch `br-sparkling-boat-ao9nrctp`), database `neondb`**.
- This PR has **NO migration, schema change, public route, Server Action, UI mutation, scheduled task, mail send, invoice issuance, payment/settlement or refund**.
- It introduces an internal service that is callable only from server code explicitly importing `createB2BCreditNoteDraft`. There is **no importer in any user-facing code** in this release.
- Default-OFF B2B Staging UAT flags remain OFF; Production unchanged.

## Internal transaction requirements
- The creator must be active seller OWNER/ADMIN and correct seller tenant.
- Formal B2BReturnRequest status must be `INSPECTED`. Source buyer PO received, company connection active, accepted B2B order and shipped/completed seller order.
- Original seller-owned Invoice must be `ISSUED` or `PAID` and the original seller Order must appear in that invoice's `InvoiceOrder`.
- Currency **JPY only**. Existing Invoice records have no currency column, and invoice UI and amounts are yen-denominated. Future non-JPY work must add authoritative invoice-currency provenance and separate migration approval; never guess currency.
- Approved, physically inspected units and already allocated Draft units are checked in SERIALIZABLE transaction under shared lock order: buyer PO → TradingConnection → ReturnRequest → sorted ReturnItem → Invoice. The DB row trigger also independently enforces inspected-unit budget across concurrent drafts.
- Unique seller + deterministic UUID-derived Draft number enables exact idempotent replay, rejects altered payloads, and uses bounded retry of true serializable conflicts (P2034 / 40001).
- Saved source invoice snapshot; proposedSubtotal/proposedTax/proposedTotal remain **NULL**. No credit note issue or financial effect.
- Draft quantities are currently immutable and **consume available inspected units**. There is no approval, cancel or release workflow in this PR. Do not enable a public Draft creation form before a reviewed lifecycle is available.

## Disposable DB tests
`src/lib/b2b-credit-note-draft-service.integration.test.ts` runs only on disposable local CI PostgreSQL. It verifies seller admin/STAFF/tenant separation, formal inspection status gate, required linked original invoice, JPY-only, UUID replay semantics and altered replay rejection, concurrent contention over one unallocated unit, source Invoice total intact and no extra InventoryMovement. Pure readiness unit tests verify missing invoice, wrong tenant/order, unissued status, non-inspected return, and allocation limits.

## UAT prerequisites
- Current Staging: 28 tables / 10 successful migrations, 0 Drafts, 0 Invoices, 2 status audits, 2 physical return events, 24 movements, buyer 36 and seller 138.
- The historical return `cmwa55eah000008jsfs3r5dwk` is `INSPECTED`, source seller Order `SO-20261110-0001` totaling 4,840 JPY. That is **not an Invoice**.
- Before any real Staging CreditNote Draft UAT, validate existing invoice creation and issuance permissions, use **only authorized test data** to create an actual issued Invoice containing that seller Order, then explicitly enable a reviewed default-OFF controlled Draft UI. Do NOT directly insert an Invoice by SQL just to bypass normal invoice workflow.
- Existing `src/app/(app)/invoices/actions.ts` has a `setInvoiceStatus` action that needs authorization/transition-hardening review before public financial UAT. Stage that as a separate focused PR.
- Future credit approval, tax, currency, money caps, legal numbering, VOID/reversal, posting and settlement require their own review, owner-approved migrations where needed, and Codex Astra full-repo review before Production.

No backup/restore is required for this **code-only** service release; the already-completed tenth migration has independent recovery evidence in PR #151.
