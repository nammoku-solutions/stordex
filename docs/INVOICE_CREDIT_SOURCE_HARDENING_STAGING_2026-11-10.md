# Invoice authorization hardening before CreditNote UAT — Staging (2026-11-10)

The approved CreditNote DRAFT database schema and internal service require an original seller Invoice whose status is ISSUED or PAID and whose InvoiceOrder contains the exact seller Order.

## Code-only safety changes
- `createInvoice`, `setInvoiceStatus`, `deleteInvoice`: OWNER/ADMIN required; never trust client buttons or TypeScript argument annotations as authorization.
- Invoice status transition policy: DRAFT→ISSUED/CANCELLED, ISSUED→PAID/CANCELLED, PAID/CANCELLED terminal. Prohibits forged states, backwards transitions and non-stateful repeated updates.
- Issue/mark-paid/cancelled is guarded by row locks and serialized DB transaction. Cancellation is denied while any B2BCreditNote header references the original Invoice.
- Deletion is limited to **DRAFT invoices only**, with no linked B2BCreditNote, locked within a transaction. Issued, paid and cancelled records must be retained for audit and CreditNote provenance.
- `/invoices/new` is accessible only to managers. Invoice list/detail mutation controls are hidden from STAFF. Server Actions reauthorize even if called directly.
- PAID marking requires a confirmation, but this is **manual status bookkeeping**, not proof of payment or a payment API.
- No database migration, credit issuance, payment, refund, invoice/stock data mutation or new feature flag in this PR.
- Production unchanged.

## Staging UAT next
1. After this PR passes CI and Staging deployment, the seller OWNER/ADMIN logs in and verifies source seller Order `SO-20261110-0001` belongs to the correct customer and its billing period.
2. Use the existing monthly invoice UI to select customer and billing month; confirm the generated invoice includes **exactly the intended seller order**, expected subtotal, tax, and total. If other orders would be included, stop instead of generating a misleading original invoice.
3. Explicitly authorize creating the **test** original invoice in Staging. Creation defaults DRAFT, then OWNER/ADMIN manually sets ISSUED. Do not mark PAID absent actual payment. Do not send a document to a real customer.
4. Introduce separate default-OFF DRAFT-only CreditNote UI after the source invoice is verified. Any Draft allocation consumes actual inspected units and cannot yet be deleted/voided; review lifecycle constraints before enabling public controls.
5. Keep the 3 existing B2B Staging flags OFF. Production requires full implementation and Codex Astra final review.
