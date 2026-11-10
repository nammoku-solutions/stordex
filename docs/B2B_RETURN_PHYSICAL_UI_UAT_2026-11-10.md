# B2B physical return UI — Release/UAT plan (2026-11-10)

**Staging-only gated implementation. No feature flag activation, DB writes, or Production release authorized by this PR.**

## Preconditions
- Approved physical event ledger migration already registered in Staging (#143), eight Prisma migrations.
- Internal physical stock posting service merged via #144; only the direct service integration test invokes it in disposable CI.
- Existing return request/approval UI gated under `STORDEX_B2B_RETURNS_ENABLED` (currently false).
- NEW independent inventory-changing UI gate: `STORDEX_B2B_RETURN_STOCK_ENABLED` (must default false, absent in Vercel). **Both** server-side flags must equal exact string `true` to show stock forms or permit stock actions.
- Only authenticated tenant OWNER/ADMIN may post. Server Actions derive tenant/user/role from `requireTenant`, verify request-line ownership before invoking service.
- PostgreSQL SERIALIZABLE posting service revalidates PO→connection→request→line and quantities; each event uses server-generated UUID, immutable event row, CAS stock change and one matching InventoryMovement. No UI-supplied tenant IDs.

## UAT after separate explicit authorization to enable the two Staging-only Preview environment flags
- Open `https://staging.stordex.jp/returns`; buyer: デモ卸売株式会社, seller: ACME物流株式会社.
- Existing transaction: `P-20261110-0001`, 3 boxes requested, 2 boxes approved; current baseline buyer D-PAPER=38, seller A-PAPER=137. **Re-read the live stock before enabling / pressing buttons**, because any intervening changes invalidate the sample numeric expectations.
- Buyer OWNER/ADMIN → approved return detail → physical progress `0/2`; check dispatch quantity 2, tick confirmation checkbox, click 「返送・出庫を確定する」 exactly once. Expect event DISPATCH=2, buyer item stock 38→36, buyer OUTBOUND movement exactly +1, seller unchanged.
- Seller OWNER/ADMIN (separate browser profile) → same return detail → uninspected dispatch 2; set received=2, saleable=1, unsaleable=1; check confirmation, click 「検品結果と良品入庫を確定する」. Expect INSPECTION=2, saleable=1, unsaleable=1, seller item stock 137→138, seller INBOUND movement exactly +1, buyer unchanged.
- Read-only physical progress should show approved=2, dispatched=2, inspected=2 and correct good/bad totals.
- **Formal `B2BReturnRequest.status` remains `PARTIALLY_APPROVED`;** displayed progress is derived from immutable stock events. A separate approved status-event migration is required before formal status transitions.
- Credit notes, original invoices, money and refunds MUST remain unchanged.
- Negative tests: STAFF, wrong company, altered request-line pair, dispatch >approved, inspection >dispatched, invalid good+bad sum, replay same UUID, competing UUIDs. Use automated disposable CI for actual concurrent/unsafe mutation tests.
- After UAT, set new flag false AND the old request/review flag false in Staging Preview, redeploy and verify `staging.stordex.jp` alias. Do not rely on Vercel env changes retroactively modifying existing deployments.

## Current PR scope
- `src/lib/b2b-return-stock-feature.ts` and tests: two independent hard-off kill switches.
- `src/lib/b2b-return-stock-form.ts` and tests: strict untrusted input validation (UUID, ID, int4 quantities, review sums, explicit confirmation).
- `src/app/(app)/returns/stock-actions.ts`: tenant-scoped, manager-authorized, independently gated Server Actions; resolve redirect from committed immutable event.
- `src/app/(app)/returns/ReturnStockForms.tsx`: confirmation-required buyer dispatch and seller inspection forms.
- `src/app/(app)/returns/[id]/page.tsx`: read-only event-derived physical progress, forms only for authorized actor, still protected by old returns gate.

## Out of scope
- No new migration, status ledger, CreditNote, financial settlement, quarantine warehouse or notification.
- No stock/invoice DB writes during this GitHub/Vercel code release; only isolated disposable CI test database can mutate.
- **Full Codex Astra repository-wide review before Production.**
