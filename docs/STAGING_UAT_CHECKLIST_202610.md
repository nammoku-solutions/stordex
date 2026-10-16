# Stordex Staging User Acceptance Checklist (Oct 2026)

This checklist is for internal trial data on https://staging.stordex.jp. Only trial the current Staging deployment; do not assume feature branches under review are already deployed.

## A. Historical inventory — deployed

1. Log in as a demo tenant. Open [在庫履歴](https://staging.stordex.jp/inventory/history).
2. In `指定日終了時点`, pick today: reported stock should match the current Item stock (unless direct DB/manual adjustments have bypassed the movement ledger).
3. Select a past date after the Item was created and manually reconcile using InventoryMovement.
4. In `期間内の在庫推移`, pick a date range, check opening + inbound - outbound + signed adjustment = ending.
5. If an item was created during the selected range, opening balance displays "—".
6. Check mobile date inputs, long product names and empty results.
7. **Important:** The current report reconstructs history from today's stock and ledger events. Migration imports or manual edits not recorded in the ledger invalidate older balances; mark as "unverified" until baseline work is completed.

## B. CSV export — deployed

1. As OWNER or ADMIN, open [CSVエクスポート](https://staging.stordex.jp/settings/export).
2. Download Customer, Supplier and Item data; check Japanese characters, leading zeros in text codes, counts and prices.
3. Download sales Orders and Purchase Orders and confirm all lines appear (each document may have multiple rows).
4. Download movements; verify signed inventory adjustments and stable timestamps.
5. As STAFF, verify the export endpoint returns access denied.
6. Check datasets with no records and very long names, commas, quotes and newlines.
7. Use non-sensitive test data when opening files in spreadsheet software. Do not use this release for production migration without a restore/reimport test.

## C. B2B corporate ordering — NOT deployed until database migrations

PR #60 models bilateral connection. PR #66 adds sending, receiving and SKU/customer mapping.

Planned test: `demo` requests `acme` -> `acme` approves -> `demo` selects the intended connected recipient and sends an ORDERED PO -> `acme` sees it in /orders/inbox -> `acme` maps customer/products and accepts -> seller draft Order is created without stock decrement -> confirm seller Order to decrement stock -> buyer confirms inbound stock on physical arrival.

Negative tests: same PO sent twice, same incoming order accepted twice, outsider tenant reading foreign order, STAFF accepting, partner connection revoked, unit mismatch, buyer cancellation before/after seller acceptance, duplicate click.

## D. CSV import — NOT deployed until database migrations

PR #68 ports Item / Customer / Supplier / external sales Order CSV import. Planned tests: 1–50 line sample first; preview -> inspect mapping -> dry run -> commit -> compare counts; repeat to confirm idempotent order and master handling; preserve initial inventory ledger and verify out-of-range/invalid number or date errors; export after import.

## Feedback

Record: tenant, screen, test date, intended result, actual result, screenshots (avoid real customer data), and whether the feature was essential / useful / unnecessary. Track bugs as GitHub Issues. No schema-destructive changes or production deploy without an explicit backup/migration plan.
