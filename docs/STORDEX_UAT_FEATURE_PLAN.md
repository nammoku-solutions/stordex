# Stordex UAT development plan (2026-10)

## Operating principle

Build small, observable feature slices on Staging and run real user trials before freezing scope. Do not disable tenant isolation, authentication, transaction checks, or basic automated tests during iteration. Perform a comprehensive functional, migration, security and operational audit before Production.

**Repository note:** `main` and `develop` have diverged. The CSV import UI, presets and ImportJob schema are currently in `develop`, while the newer Prisma runtime, committed migrations and hardening are on `main`. Do not merge the entire branches blindly; port and adapt CSV features against the current schema, then test migrations with a copy of the Staging DB.

## 1. B2B enterprise connections (P0)

- Start with explicit bilateral company invitations: PENDING -> ACTIVE / DECLINED / REVOKED.
- Only OWNER/ADMIN may invite, accept or revoke company connections.
- Each company's Customer/Supplier master remains its own tenant-owned record; connecting tenants must not merge master records.
- Allow a buyer-side Supplier to opt in to mapping against an ACTIVE counterparty.
- A buyer's approved PurchaseOrder creates a **new inbound order snapshot** for the seller, not a direct write into the seller's stock.
- The seller's order inbox displays source company, order number, products, units, requested quantity and agreed prices (with snapshots). Dedupe by buyer tenant + purchase order ID/version, not display order number alone.
- An authorized seller checks product mappings (code, unit, pack quantity, price) and explicitly accepts/creates its own Order.
- Transitions on seller Order and buyer PurchaseOrder are coordinated with event history and idempotency; canceled/edited orders require explicit business rules.
- Buyer RECEIVED adds its own stock; seller CONFIRMED/SHIPPED updates its own stock exactly once. No cross-tenant direct inventory mutation.
- Track origin and correlation IDs, actor, timestamp, retries and changes with a tenant-visible audit trail.
- Never infer a company connection from a matching name, email, user ID or product code.

**UAT:** `demo` invites `acme`, `acme` accepts; `demo` sends a PO; `acme` sees an inbound order; mappings are approved, then a local sales Order is created; shipment/receipt flows show on both sides. Test duplicate clicks, repeated deliveries, unauthorized tenant access and revocation.

## 2. CSV migration and coexistence (P0/P1)

Targets:
- Customer, Supplier and Item masters (including starting inventory), current stock and inventory ledger.
- Sales Orders and Purchase Orders with every line, including historical dates, status and original external ID.
- CSV export of each of those for **exit migration** to another system (stable field definitions and schema version).
- External-sales-system import with reusable per-tenant column mapping, Japanese headers, UTF-8 BOM / Shift_JIS, dry run and errors-by-row.

Requirements:
- Reuse `develop` CSV parser, auto mapping, presets, dry run and ImportJob UX after migration compatibility review.
- Imports must be transactional in bounded batches and idempotent by tenant + source system + external record identifier, with duplicate detection and validation.
- Never use untrusted file/customer IDs to set `tenantId`. Validate all customer/item/supplier relations within the authorized tenant.
- Do not automatically confirm imported Orders or alter inventory until the operator approves reconciliation.
- Strictly validate dates, quantities, prices, inventory effects and CSV size/row limits; avoid formula injection in exported CSV.
- Supply sample template CSV files and a real round-trip export -> import test (to an empty tenant).
- Initial inventory or backdated migration must create reliable stock baselines or ledger entries for historical report accuracy.
- For past orders, distinguish **document date** from posting date; do not silently perform backdated stock operations.

**UAT:** import a small known dataset, review dry run, commit once, repeat and confirm no duplicates; export all records and re-import to an isolated sandbox tenant with matching totals.

## 3. Historical inventory (P1)

- Support single Japanese calendar date (end of day) and inclusive date range.
- Show opening, inbound, outbound, adjustments and closing balances per item; later include warehouse/lot and CSV export.
- Base calculations on signed InventoryMovement ledger and stock snapshots, not sales order dates alone.
- `ADJUSTMENT.quantity` is a signed difference even though the form accepts an absolute physical count.
- Beware legacy direct stock mutations, initial stock entered without ledger, item deletion and delayed posting: reconstructed balances before a trustworthy baseline are **not audited historical truth**.
- Next increment should persist a baseline/effective movement date and show an explicit reliability indicator; do not present suspect historical numbers as definitive.

**UAT:** create opening stock, inbound, outbound and signed adjustment across different JST dates; compare with hand-calculated closing and repeat for a month range.

## 4. Paper FAX integration (research only until validated)

**Inbound:** receive fax as PDF (cloud fax or existing MFP-to-mail), keep original securely -> OCR of Japanese printed/handwritten entries -> structured order extraction -> match known customer/SKU -> user compares PDF and generated draft -> save to Sales Order. Capture OCR confidence and per-field corrections; never auto-confirm stock impact from OCR alone.

**Outbound:** render PurchaseOrder as A4 PDF -> recipient fax address book -> user review & explicit send confirmation -> cloud fax API -> delivery result/webhook, retry/undeliverable alerts and immutable send history. Distinguish provider API-accepted from actually delivered.

Candidate vendors/tech to pilot: Japanese cloud fax API (e.g. CLOUD-FAX-API or InterFAX), Azure Document Intelligence Japanese OCR. Evaluate fax number ownership, sender-number presentation, geographic coverage, per-page/minimum monthly fees, data retention, security and cancellation behavior.

Pilot with at least 20 anonymized or consented real order samples across multiple layouts. Measure exact-line accuracy, human correction time and send delivery success; reject or defer automatic sending if error rates are high.

## 5. Development & release gates

1. Small PR per deliverable -> CI typecheck and essential unit tests; if a dependency audit fails, repair the baseline instead of suppressing the gate.
2. Preview deploy -> verify correct Staging URL, environment, DB schema state and seed accounts; do not change `stordex.jp`.
3. User testing on real workflow samples -> record time saved, error/rework rate, blocking problems; remove low-value functionality.
4. Before Production: transaction/tenant-escape tests, exhaustive role validation, CSV attack and resource-limit tests, FAX send controls (if implemented), database migration rehearsal + backup/restore, dependency review, regression tests and performance.
