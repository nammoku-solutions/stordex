# B2B return formal status reconciliation — manual Staging UAT plan (2026-11-10)

## Release scope and safety
- Ninth immutable status ledger migration has been explicitly approved and already applied on Staging via #147. **No new migration is included here.**
- Service-only code released via #148. This PR adds a **manual, individually confirmed**, actor-authorized UI on the return detail page and server-side, audit-logged reconciliation action.
- The new kill switch `STORDEX_B2B_RETURN_STATUS_RECONCILE_ENABLED` defaults to **OFF**. The existing return forms flag `STORDEX_B2B_RETURNS_ENABLED` must **also** equal exact `true`. Keep `STORDEX_B2B_RETURN_STOCK_ENABLED` explicitly **false** during status-only UAT.
- Staging-only Vercel Preview Git branch `staging`: never touch Production or unrelated Preview branches.
- No auto transition is performed on render, background job, deploy or button preview. Only an authorized OWNER/ADMIN explicitly confirming a stage transition can change the formal return request status.
- Formal audit rows are append-only and link actor, tenant, before/after statuses, idempotency key and immutable physical evidence fingerprint. Other company's manager name is deliberately obscured in the shared UI.
- **No Item.stock, InventoryMovement, Invoice, InvoiceOrder, CreditNote, tax, refund or settlement writes.**

## Baseline after earlier physical UAT
- `P-20261110-0001`: requested 3, approved 2, buyer dispatched 2, seller inspected 2, saleable 1, unsaleable 1.
- Formal request status still `PARTIALLY_APPROVED`; status audit history 0 rows.
- Buyer D-PAPER 36 units; seller A-PAPER 138 units; 24 total inventory movements; 2 immutable physical events.
- Recheck these numbers immediately before activating / clicking buttons; stop if anything differs.

## Staging-only UAT (after a **separate explicit user authorization** to enable the two relevant flags)
1. User opens `https://staging.stordex.jp/returns/cmwa55eah000008jsfs3r5dwk` as the **buyer** tenant's OWNER/ADMIN. Hard refresh; verify `PARTIALLY_APPROVED`, 2 dispatched, 2 inspected, inventory 36/138.
2. Confirm the form says `一部承認→返送済み`, tick checkbox, click `返送済みに同期する` **once**. Expect status `DISPATCHED`, one immutable audit event attributed to the buyer, inventory 36/138 and 24 movements unchanged.
3. User switches to the **seller** tenant's OWNER/ADMIN in a separate browser profile; opens the same return. Verify `DISPATCHED`, completed 2/2 inspection, form says `返送済み→検品済み`.
4. Tick confirmation and click `検品済みに同期する` once. Expect status `INSPECTED`, a second immutable audit event attributed to the seller. Stock remains 36/138, 24 movements, 2 physical events.
5. Both tenants see the two status audit transitions; only same-company actor name is disclosed. Invoice/refund/CreditNote untouched.
6. Negative tests: STAFF cannot see button, wrong tenant receives no record, stale status/form mutation rejected, repeated same UUID idempotent (automated CI), missing event evidence rejected. **Do not perform extra stock mutations** to test negative cases.
7. DB read-only audit by assistant: status audit chain `PARTIALLY_APPROVED→DISPATCHED→INSPECTED`, actor tenant match, SHA-256 fingerprints, no unexpected events; compare current stock/movements/invoices with baseline.
8. Disable both `STORDEX_B2B_RETURNS_ENABLED` and `STORDEX_B2B_RETURN_STATUS_RECONCILE_ENABLED`, verify `STORDEX_B2B_RETURN_STOCK_ENABLED=false`, redeploy `staging` branch and assign `staging.stordex.jp` only after Vercel READY.

## Boundaries
- No Claim that status writes are currently atomic with physical stock events. This controlled manual reconciliation intentionally addresses the already committed UAT physical events, after-the-fact; future fully automatic flows will need a single transaction or audited retriable outbox workflow.
- This release deliberately stops at INSPECTED. CREDIT_PENDING/CLOSED and CreditNote adjustments require separate finance workflows, migrations, independent backup+restore and user approval.
- Production deployment requires all features and comprehensive Codex Astra review PASS.
