# Stordex Inventory Policy & Counted Receipt

> 2026-10-19. Feature in development on a PR branch, **not on Staging or Production**.
> Final production release requires entire-code Codex Astra Review PASS (Issue #87; RELEASE_GATE.md).

## Product behavior

- `Item.stockPolicy` = `STOCKED` (常備在庫品) or `ON_DEMAND` (受注後仕入品). Existing products default STOCKED; no legacy inventory count is changed. `reorderPoint` remains the minimum threshold and a stocked item alerts only if threshold > 0 **and** stock < threshold.
- ON_DEMAND physically remaining `Item.stock` is shown in Dashboard and Inventory as potential spare units. Any current DRAFT sales-order quantities are separately displayed as *uncommitted demand*. Estimated available = max(0, physical stock − draft demand). CONFIRMED/SHIPPED orders already deducted from physical stock and **must not** be deducted a second time. A draft does not reserve inventory: treat estimate as advisory.
- `Item.unit` is the *base stock and sale unit*. Supplier `purchaseMode` is `UNIT` or `PACK`; for PACK use `caseQty` >= 2 and `orderUnit` (box/pack/case). A purchase form input is **whole packs** and the submitted `PurchaseOrderItem.quantity` remains base units. Server validates the quantity is an exact multiple of master pack size.
- The PO line snapshots `packSize`, `packCount` and `packUnit` so the historical purchase terms remain visible after the item master changes. Legacy PO lines have NULL snapshots.
- The receipt form for an ORDERED PO pre-fills all ordered base-unit quantities and allows the receiving staff to enter actual counted units (including excess/short). The receipt action reads every line from the DB under the existing PO row lock, validates all IDs, integer counts, existing receipts, and requires a discrepancy reason for any change from ordered quantity. The inventory ledger movement and PO received count use actual counted units, **exactly once**. The original purchase value and ordered quantity stay unchanged. Differences are retained in PO note and inventory movement notes; invoice reconciliation stays manual.
- An order received short is closed as `RECEIVED` in this phase and the discrepancy note explains the shortage. Handle outstanding supplier units by a fresh PO rather than silently rereceiving the closed document. Full partial-receipt workflow is out of scope.
- For B2B, buyer can record physical over/short receipt only after seller SHIPPED/COMPLETED. A mismatch does **not** silently adjust the seller's already posted stock or invoices; resolve with the trading partner. Dedicated discrepancy acknowledgment, return and credit notes are tracked separately (Issue #82).

## Security and correctness gates

- Tenant boundaries on master SKU creation/updates and PO lines; buyer PO row lock serializes receipt and cancel; conditional state transition prevents duplicate movements; discrepancy reason and bounds validated server-side; no untrusted pack sizing accepted from client.
- All new Prisma schema additions are additive and default legacy items to STOCKED/UNIT. **Never apply to populated Neon Staging before migration-ledger repair in Issue #70 has been rehearsed on a clone.**
- Plan UAT: (A) STOCKED threshold crossing; (B) ON_DEMAND leftovers after a ten-unit pack received and nine-unit confirmed sale; (C) order 9 / actually received 10; (D) short delivery with reason; (E) different pack sizes and immutable PO snapshots; (F) repeated receive clicks; (G) cross-tenant and B2B restrictions.
