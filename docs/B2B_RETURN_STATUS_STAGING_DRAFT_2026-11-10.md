# Issue #82 — Physical return status and immutable audit (Staging Draft, 2026-11-10)

**Do not merge / apply this migration on Neon Staging or Production without separate user approval.**

## Current verified baseline
- Staging commit `03586e63b0c5b984cf12912f50f569640263af58`, eight applied migrations, 25 tables.
- Physical return UAT: buyer dispatched 2, seller inspected 2 (saleable 1, unsaleable 1). Buyer stock D-PAPER=36; seller stock A-PAPER=138; two immutable stock events and 24 InventoryMovement rows.
- Request `RET-8c1cdee7-17f7-4f58-8a11-68efeccf9e04` remains `PARTIALLY_APPROVED`, as expected under existing release.
- `STORDEX_B2B_RETURNS_ENABLED` and `STORDEX_B2B_RETURN_STOCK_ENABLED` reset to false in staging-scoped Vercel Preview environment.
- Earlier proposed PR #129 is stacked atop **unapproved CreditNote schemas**, so must not be merged into current staging.

## Proposed Draft
1. **Migration `20261106110000_b2b_return_status_events`**:
   - Add `B2BReturnStatusEvent` with event UUID/idempotency hash, immutable source totals hash, buyer/seller tenant and management actor, before/after states and timestamps.
   - Only approve physical state edges: `APPROVED/PARTIALLY_APPROVED→DISPATCHED→PARTIALLY_INSPECTED/INSPECTED` and `PARTIALLY_INSPECTED→INSPECTED`.
   - **No `CREDIT_PENDING` or `CLOSED` writer/edge** until an independent CreditNote or audited no-credit-due workflow is authorized.
   - SQL trigger confirms target state was actually committed, tenant and management role, physical evidence and rejects update/delete.
2. Pure existing `assessB2BReturnStatusTransition` remains unchanged; the draft `recordPhysicalReturnStatus` writes a status audit event + CAS status update in one Serializable transaction.
3. CI-only PostgreSQL integration tests cover evidence-backed transitions, exact UUID replay, forged replay, wrong tenant, STAFF denial, immutable event history and racing status commands.

## Important architectural distinction: manual sync vs automatic progress
- This PR deliberately **does not connect a public route or Server Action**, and does not change the UAT request status in Staging.
- Initial release should use a separately gated, user-authorized reconciliation action. The 2026-11-10 UAT already contains both dispatch and full inspection events, so reconciliation must proceed in order: buyer `PARTIALLY_APPROVED→DISPATCHED`, then seller `DISPATCHED→INSPECTED`.
- For future automatic transitions, the physical event writer and status audit must share one transaction (or an auditable, retriable event processor) so stock changes cannot commit while the formal state stays obsolete. Do not claim two independent sequential writes are atomic.
- Stock, invoice, credit, refunds and other financial operations are not modified by this Draft.

## Release gates
1. CI on disposable localhost PostgreSQL: migration deploy, Prisma schema-drift, typecheck, integration tests, build and dependency audit.
2. Audit cross-tenant source and actor guards and lock ordering, test complete/partial quantities and replays, and repair any failing tests.
3. Owner-approved updated AES256 backup for current 25-table Staging snapshot and independent restore of **25 tables / 8 migrations** with row hashes/schema and existing return events. Previously verified 24-table backup is no longer the current baseline.
4. Request explicit authorization for the **single migration** `20261106110000_b2b_return_status_events` after restoration. Never run `prisma migrate deploy` indiscriminately on live Staging.
5. After authorization and application, release the code and user-facing reconciliation UI under a separate default-OFF feature flag; UAT verify audit chain and no inventory delta.
6. Production only after all features and Codex Astra end-to-end review PASS.
