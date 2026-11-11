# CreditNote — Read-only JPY amount / tax proposal, phase 1

Date: 2026-11-11. Scope: calculation design and pure tests only.

## Context and limits

- Staging Git baseline: PR #155 squash merge, commit 598de51f270e5a4365b7ab4f58c86fd6114b1be7.
- Staging Neon: project stordex-staging (dry-feather-14704968), branch staging (br-sparkling-boat-ao9nrctp), database neondb.
- Independent restore: stordex-recovery-test (delicate-rice-23940930), branch *internally named* production (br-ancient-voice-aoutl8qq, NOT actual Production), database stordex_restore_post_credit_20261111.
- Staging already has 11 migrations. Original CreditNote is VOID and its 2-box allocation is now released, with 1 immutable audit event and original line intact.
- All five B2B Staging Preview/staging flags were returned OFF after the UAT. Keep OFF.
- No CreditNote issue, tax ledger, amount writer, invoice cancellation, settlement, refund, offset, payment, or Production change is authorized.

## Verified invoice arithmetic

The existing invoice action in src/app/(app)/invoices/actions.ts supports:

1. Invoice-wide tax (taxPerOrder=false): invoice subtotal = sum of Order subtotals; tax = floor(invoiceSubtotal * invoice.taxRate / 100).
2. Per-Order tax (taxPerOrder=true): invoice subtotal/tax/total = sums of original Order subtotal/tax/total; each Order tax = floor(orderSubtotal * its taxRate / 100).
3. Integer-yen values throughout. The source Invoice does NOT record currency provenance.
4. A mapped seller source line is identified by IntercompanyOrderItem.sellerOrderItemId, not position, name or SKU guess.
5. Current CreditNote monetary proposal fields remain NULL, and DB permits only DRAFT/VOID states.

## Provisional read-only calculation

The pure module src/lib/b2b-credit-readonly-amounts.ts has no Prisma, database, route or Server Action import.

It requires:
- Full original seller-scoped Invoice + all its InvoiceOrder-linked Orders and OrderItem source lines; consistency-checked source amounts.
- Explicitly verified JPY provenance by the caller. No automatic JPY inference just because the UI displays yen.
- ISSUED/PAID invoice and zero other active credit proposals; historical VOID notes do not count.
- Inspection-derived approved/inspected units and current active allocation counts, mapped to exact seller source lines.

For a set of inspected, unallocated returned quantities:
- Credited net = SUM(creditedQuantity * originalSellerOrderItem.unitPrice).
- If taxPerOrder=false: credited tax = oldInvoice.tax - floor((oldInvoice.subtotal - creditedNet) * oldInvoice.taxRate / 100).
- If taxPerOrder=true: credited tax = SUM, by linked Order, (oldOrder.tax - floor((oldOrder.subtotal - creditedNetForOrder) * oldOrder.taxRate / 100)).
- Credited gross = credited net + credited tax; hypothetical remaining totals = original minus credited totals.
- All amounts must be nonnegative exact integers within the existing PostgreSQL integer cap, and never exceed the original Invoice.
- Reject incomplete invoices, duplicate/unrelated seller lines, mismatched stored source totals/taxes, uninspected/overallocated units, and existing other active credits.
- For invoice-wide tax, do not pretend to allocate taxes to individual order lines: per-order credit tax is NULL and tax is calculated once at the invoice level.

Difference-of-original-tax ensures that an entire original invoice return preserves the original tax and that small partial refunds do not accumulate independently rounded tax discrepancies. This is provisional arithmetic, NOT an accounting or legal policy approval.

## Existing Staging fixture: worked example only

- Original seller invoice I-202611-0001 is ISSUED, taxPerOrder=false, tax rate 10%.
- Original sold: 5 units x JPY 880 = net 4,400, tax 440, gross 4,840.
- Formal return INSPECTED: 2 units. Original DRAFT was VOID, active allocation now 0.
- Hypothetical two-unit new draft: net 1,760, provisional tax 176, gross 1,936.
- Hypothetical remaining original invoice: net 2,640, tax 264, gross 2,904.
- Nothing from this phase persists these amounts or creates a replacement DRAFT.

## Test and design gates

- Partial/full return, invoice-wide and per-Order rounding, mixed order tax rates, 0-yen tax delta.
- Source snapshot tampering, duplicates, unrelated lines, incomplete InvoiceOrder links, currency unverified, unissued Invoice, other active credit proposals, over-inspection, integer overflow.
- Pure function always returns financialPostingAllowed=false for successful previews; there are no write paths.
- No schema change / 12th Migration in this PR; no backup or Restore necessary merely to merge a pure calculator and its tests.

## Before monetary write / issue (future separate approval)

1. Establish verifiable invoice currency; legacy Invoice has no currency column.
2. Confirm legally appropriate Japanese qualified return-invoice fields, tax-rate separation, discounts, rounding, multiple invoices, and prior actually posted credits with accounting.
3. Decide four-eyes approval (maker != approver), seller permissions, amount ceilings, tax reconciliation, immutable snapshots, audit and idempotency.
4. Require fresh encrypted backup, independent Restore and explicit separate user authorization for any 12th live Staging migration.
5. Released 2-unit reallocation into a new DRAFT is an independent Staging UAT and was not part of the prior VOID approval.
6. No Production until all features are complete and the Codex Astra whole-repo final review PASS.
