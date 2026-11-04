/**
 * Issue #62 — read-only reconciliation of Stordex's *existing* item-current-stock
 * export against its inventory movement history export.
 *
 * IMPORTANT: This does not replay, persist or create movements. All current-stock
 * and history values come from user-supplied exported CSVs.
 */
export const ITEM_MIGRATION_EXPORT_HEADERS = [
  "code", "name", "nameKana", "nameEn", "unit", "spec", "origin",
  "caseQty", "orderUnit", "stockPolicy", "purchaseMode", "isImported",
  "deliveryCycle", "barcode", "stock", "reorderPoint", "reorderPeak",
  "costPrice", "salesPrice", "supplierCode", "category", "note",
  "active", "createdAt", "updatedAt",
] as const;

export const MOVEMENT_MIGRATION_EXPORT_HEADERS = [
  "movementId", "createdAt", "itemCode", "itemName", "type",
  "quantity", "balance", "warehouseCode", "lotNumber", "expiryDate",
  "location", "reference", "note",
] as const;

export type InventoryLedgerIssue = {
  file: "items" | "movements";
  row: number;
  field: string;
  message: string;
};

export type InventoryLedgerSummary = {
  code: string;
  currentStock: number;
  movementCount: number;
  inferredOpening: number | null;
  lastBalance: number | null;
};

export type InventoryLedgerPreflight = {
  ok: boolean;
  itemCount: number;
  movementCount: number;
  reconciledItems: number;
  unverifiedItems: number;
  sourceStockTotal: number;
  openingStockTotal: number;
  errors: InventoryLedgerIssue[];
  warnings: InventoryLedgerIssue[];
  /** No database model IDs or source text are ever returned. */
  summaries: InventoryLedgerSummary[];
};

// Item.stock, InventoryMovement.quantity and .balance are PostgreSQL int4.
const INT32_MAX = 2_147_483_647;
const INT32_MIN = -2_147_483_648;
const MAX_ROWS = 10000;
const MAX_ISSUES = 50;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateIsValid(raw: string, timestamp: boolean): boolean {
  if (timestamp ? !UTC_TIMESTAMP.test(raw) : !ISO_DATE.test(raw)) return false;
  const parsed = new Date(timestamp ? raw : raw + "T00:00:00.000Z");
  if (Number.isNaN(parsed.valueOf())) return false;
  return timestamp ? parsed.toISOString() === raw : parsed.toISOString().slice(0, 10) === raw;
}

function strictInteger(value: string, signed = false): number | null {
  const pattern = signed ? /^(?:0|[1-9]\d*|-[1-9]\d*)$/ : /^(?:0|[1-9]\d*)$/;
  if (!pattern.test(value)) return null;
  const num = Number(value);
  return Number.isSafeInteger(num) && num <= INT32_MAX &&
    num >= (signed ? INT32_MIN : 0) ? num : null;
}

function columns(
  rows: string[][],
  expected: readonly string[],
  file: InventoryLedgerIssue["file"],
  error: (file: InventoryLedgerIssue["file"], row: number, field: string, message: string) => void,
): Map<string, number> | null {
  if (!rows.length || !rows[0]?.length) {
    error(file, 1, "header", "CSVのヘッダーがありません");
    return null;
  }
  if (rows.length - 1 > MAX_ROWS) {
    error(file, 1, "rows", "一度に検証できるのは10,000行までです");
    return null;
  }
  const row = rows[0];
  if (row.length !== expected.length || row.length !== new Set(row).size ||
      expected.some(name => !row.includes(name))) {
    error(file, 1, "header", "StordexのCSVエクスポート形式と列構成が一致しません");
    return null;
  }
  return new Map(row.map((name, index) => [name, index]));
}

/** Check balance = previous balance + signed movement quantity per SKU. */
export function preflightInventoryLedgerExports(input: {
  items: string[][];
  movements: string[][];
}): InventoryLedgerPreflight {
  const errors: InventoryLedgerIssue[] = [];
  const warnings: InventoryLedgerIssue[] = [];
  const error = (file: InventoryLedgerIssue["file"], row: number, field: string, message: string) => {
    if (errors.length < MAX_ISSUES) errors.push({ file, row, field, message });
  };
  const warning = (file: InventoryLedgerIssue["file"], row: number, field: string, message: string) => {
    if (warnings.length < MAX_ISSUES) warnings.push({ file, row, field, message });
  };
  const itemColumns = columns(input.items, ITEM_MIGRATION_EXPORT_HEADERS, "items", error);
  const movementColumns = columns(input.movements, MOVEMENT_MIGRATION_EXPORT_HEADERS, "movements", error);
  if (!itemColumns || !movementColumns) {
    return {
      ok: false, itemCount: 0, movementCount: 0, reconciledItems: 0,
      unverifiedItems: 0, sourceStockTotal: 0, openingStockTotal: 0,
      errors, warnings, summaries: [],
    };
  }
  const get = (row: string[], key: string, index: Map<string, number>) =>
    row[index.get(key)!] ?? "";

  const items = new Map<string, InventoryLedgerSummary>();
  let stockTotal = 0;
  let movementsSeen = 0;
  for (let i = 1; i < input.items.length; i++) {
    const row = input.items[i], number = i + 1;
    if (row.length !== itemColumns.size) {
      error("items", number, "row", "列数が一致しません");
      continue;
    }
    const code = get(row, "code", itemColumns);
    const name = get(row, "name", itemColumns);
    const stock = strictInteger(get(row, "stock", itemColumns));
    if (!code.trim() || code.trim() !== code || !name.trim()) {
      error("items", number, "code", "商品コードまたは商品名が不正です");
      continue;
    }
    if (items.has(code)) {
      error("items", number, "code", "商品コードが重複しています");
      continue;
    }
    if (stock === null || stock < 0) {
      error("items", number, "stock", "現在庫は0〜2,147,483,647の整数で指定してください");
      continue;
    }
    if (!Number.isSafeInteger(stockTotal + stock)) {
      error("items", number, "stock", "在庫の合計が安全な整数範囲を超えています");
      continue;
    }
    stockTotal += stock;
    items.set(code, {
      code, currentStock: stock, movementCount: 0,
      inferredOpening: null, lastBalance: null,
    });
  }

  const movementIds = new Set<string>();
  let previousSortKey = "";
  for (let i = 1; i < input.movements.length; i++) {
    const row = input.movements[i], number = i + 1;
    if (row.length !== movementColumns.size) {
      error("movements", number, "row", "列数が一致しません");
      continue;
    }
    const id = get(row, "movementId", movementColumns);
    const code = get(row, "itemCode", movementColumns);
    const createdAt = get(row, "createdAt", movementColumns);
    const type = get(row, "type", movementColumns);
    const quantity = strictInteger(get(row, "quantity", movementColumns), type === "ADJUSTMENT");
    const balance = strictInteger(get(row, "balance", movementColumns));
    const expiry = get(row, "expiryDate", movementColumns);
    const sku = items.get(code);

    if (!id.trim() || id !== id.trim() || movementIds.has(id)) {
      error("movements", number, "movementId", "履歴IDが空、不正、または重複しています");
    }
    movementIds.add(id);
    if (!sku) {
      error("movements", number, "itemCode", "商品マスタCSVに存在しない商品コードです");
    }
    if (!dateIsValid(createdAt, true)) {
      error("movements", number, "createdAt", "日時は正しいUTC ISO形式で指定してください");
    }
    if (expiry && !dateIsValid(expiry, false)) {
      error("movements", number, "expiryDate", "賞味期限の日付が不正です");
    }
    if (!["INBOUND", "OUTBOUND", "ADJUSTMENT"].includes(type)) {
      error("movements", number, "type", "未対応の入出庫種別です");
    }
    if (quantity === null || (type !== "ADJUSTMENT" && quantity <= 0)) {
      error("movements", number, "quantity", "入出庫数が不正です");
    }
    if (balance === null || balance < 0) {
      error("movements", number, "balance", "履歴後在庫が不正です");
    }

    // The exporter orders globally by createdAt ASC, id ASC.
    const sortKey = createdAt + "|" + id;
    if (dateIsValid(createdAt, true) && previousSortKey && sortKey <= previousSortKey) {
      error("movements", number, "createdAt", "履歴の並び順が出力形式と一致しません");
    }
    previousSortKey = sortKey;

    if (!sku || quantity === null || balance === null ||
        !dateIsValid(createdAt, true) ||
        !["INBOUND", "OUTBOUND", "ADJUSTMENT"].includes(type) ||
        (type !== "ADJUSTMENT" && quantity <= 0)) {
      continue;
    }
    const delta = type === "OUTBOUND" ? -quantity : quantity;
    if (sku.lastBalance === null) {
      const opening = balance - delta;
      if (!Number.isSafeInteger(opening) || opening < 0 || opening > INT32_MAX) {
        error("movements", number, "balance", "最初の移動から非負の開始在庫を推定できません");
      } else {
        sku.inferredOpening = opening;
      }
    } else {
      const expected = sku.lastBalance + delta;
      if (!Number.isSafeInteger(expected) || expected !== balance) {
        error("movements", number, "balance", "直前残高と入出庫増減が一致しません");
      }
    }
    sku.lastBalance = balance;
    sku.movementCount++;
    movementsSeen++;
  }

  let reconciled = 0, unverified = 0, openingTotal = 0;
  for (const sku of items.values()) {
    if (sku.movementCount === 0) {
      unverified++;
      warning("items", 1, "stock", "履歴のない商品があります。移行時には開始在庫を別途確定してください");
    } else {
      reconciled++;
      if (sku.lastBalance !== sku.currentStock) {
        error("items", 1, "stock", "履歴の最終残高と商品マスタの現在庫が一致しません: " + sku.code);
      }
      if (sku.inferredOpening !== null) {
        openingTotal += sku.inferredOpening;
        if (!Number.isSafeInteger(openingTotal)) {
          error("movements", 1, "balance", "推定開始在庫の合計が安全な整数範囲を超えています");
        }
      }
    }
  }
  return {
    ok: errors.length === 0,
    itemCount: items.size,
    movementCount: movementsSeen,
    reconciledItems: reconciled,
    unverifiedItems: unverified,
    sourceStockTotal: stockTotal,
    openingStockTotal: openingTotal,
    errors, warnings,
    summaries: errors.length ? [] : [...items.values()],
  };
}
