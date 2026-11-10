# CreditNote DRAFT-only UI — Staging UAT gate (2026-11-10)

## Live verified starting state (read-only Neon verification)
**Source is Neon project `stordex-staging` (`dry-feather-14704968`), branch `staging` (`br-sparkling-boat-ao9nrctp`), database `neondb`.** This is **not** Production.

- 28 public tables, 10 completed migrations (the tenth CreditNote DRAFT-only migration was independently restored and explicitly approved).
- Seller ACME物流株式会社 issued original invoice `I-202611-0001`, ID `cmwam6cdt000008jp4d37nhp3`, status `ISSUED`, period November 2026.
- Invoice contains **only** seller order `SO-20261110-0001` belonging to buyer デモ卸売株式会社; seller tenant, invoice customer and seller order identities match.
- Original invoice subtotal JPY 4,400, tax 440, total 4,840; source order totals also identical.
- Return ID `cmwa55eah000008jsfs3r5dwk` is `INSPECTED`, approved 2 boxes, dispatched 2, inspected 2; 1 saleable + 1 unsaleable.
- Original 2 append-only status events, 2 physical stock events, 24 InventoryMovements; buyer D-PAPER 36 and seller A-PAPER 138.
- 0 CreditNote headers and 0 lines currently. Existing B2B return/stock/status UAT flags OFF.

## UI release, default OFF
- **Independent feature flag:** `STORDEX_B2B_CREDIT_DRAFT_ENABLED`, absent/OFF by default. In addition to the exact literal `true`, runtime **MUST** be `VERCEL_ENV=preview` and `VERCEL_GIT_COMMIT_REF=staging`.
- Flag should only be created **after separate user approval** in the Vercel Stordex project **Preview target scoped solely to Git branch `staging`**. No Preview QA branch needed; use only staging for browser UAT.
- This PR does **NOT** enable the flag, migrate a DB, create an invoice or CreditNote, or change the old three B2B flags. Production untouched.
- Seller's OWNER/ADMIN can open linked issued Invoice and follow the explicit `返品 ... の下書きを準備` link to `/credit-notes/new?returnRequestId=...`.
- The new page displays original invoice, real inspection totals, prior allocated draft units, and remaining units. Unrelated tenant/STAFF and disabled flag get 404. No automatic writes.
- Exact UUID idempotency key, explicit checkbox confirmation, strict 1-100 line parser, integer quantities, no duplicate item ID or duplicate mandatory parameter. Action enforces flag and role, delegates to internal Serializable service with source invoice/tenant/inventory audit validation.
- On successful manual creation, detail page shows DRAFT status, immutable allocated quantity, original invoice reference, **proposed money amount unset**, and a warning about no refunds/payment/stock updates.

## Important safety caveat
**CreditNote DRAFT allocated quantities are currently immutable and irrevocable.** There is **no Draft cancellation, VOID, reset or release** mechanism. The test should **never** be executed twice with new UUIDs for the same inspected quantity. With the current 2-box return, a one-time 2-box DRAFT would consume all 2 inspected units, preventing a second Draft on those units. This is a reversible *deployment flag*, but not a reversible Draft allocation. Before clicking the creation button, obtain the user's **separate explicit approval** for the permanent test allocation on this specific Staging return.

## Browser UAT plan after approval
1. Audit Neon source remains at 28 tables/10 migrations, one issued original Invoice/one InvoiceOrder, zero CreditNotes, 2 status events, 2 stock events, 24 movements and stock 36/138.
2. Turn on only `STORDEX_B2B_CREDIT_DRAFT_ENABLED=true` at project Preview gitBranch `staging`. Leave `STORDEX_B2B_RETURNS_ENABLED=false`, `STORDEX_B2B_RETURN_STATUS_RECONCILE_ENABLED=false`, `STORDEX_B2B_RETURN_STOCK_ENABLED=false`. Redeploy exact staging commit to READY then assign `staging.stordex.jp`.
3. Log in as seller ACME物流株式会社 OWNER/ADMIN. Open `/invoices/cmwam6cdt000008jp4d37nhp3`. Follow `返品 ... の下書きを準備`.
4. Confirm invoice `I-202611-0001`, original total JPY 4,840, source return inspected 2 boxes, previously allocated 0, available 2. Confirm the warning and tick checkbox.
5. **Only after explicit authorization:** create exactly **one DRAFT** allocating the two inspected boxes to it (JPY amount stays NULL). Save the resulting Draft number.
6. Confirm DRAFT persisted with exactly one quantity allocation of 2, no credit issuance or monetary calculations; invoices/stock/movement histories unchanged. The same UUID replay behavior is validated by disposable CI rather than a second live button click.
7. Negative tests via CI; do not make extra test Drafts, try SQL deletes, or change paid/issued status manually.
8. Re-disable the new credit flag, redeploy exact staging commit to READY, assign alias, and verify 0 new invoice, stock, payment or audit mutations. Return the new creditNoteId in the report.

## Boundaries and later work
- **No credit amount calculation, issuance, credit approval, tax recalculation, refund/offset or legal financial document numbering.** Amount fields intentionally NULL. Recording an inspected quantity is *not* approving a refund.
- Before public release beyond isolated Staging UAT, design Draft cancellation/amendment/VOID policy, financial amount reconciliation, tax policy and approved audit/issuance lifecycle. Those may require new migration and a fresh encrypted backup plus independent restore and explicit permission.
- The underlying CreditNote schema's own DRAFT-only constraint prohibits every non-DRAFT status. Final full-repository Codex Astra review required before Production.
