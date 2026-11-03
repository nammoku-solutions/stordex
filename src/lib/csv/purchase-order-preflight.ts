/**
 * Strict, read-only preflight for the current Stordex purchase-order CSV export.
 *
 * This module parses source snapshots but never writes to Prisma or replays stock
 * movements. It is the prerequisite for a future, explicitly approved importer.
 */
export const PURCHASE_ORDER_EXPORT_HEADERS = [
  "poNumber", "supplierCode", "supplierName", "orderDate", "pickupDate",
  "status", "note", "taxRate", "subtotal", "tax", "total",
  "itemCode", "itemName", "unit", "quantity", "unitPrice", "amount",
  "received", "packSize", "packCount", "packUnit", "createdAt", "updatedAt",
] as const;

export type PurchaseOrderImportSnapshot = {
  poNumber: string;
  supplierCode: string;
  supplierName: string;
  orderDate: string;
  pickupDate: string | null;
  status: "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED";
  note: string | null;
  taxRate: number;
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  lines: {
    itemCode: string;
    itemName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    received: number;
    packSize: number | null;
    packCount: number | null;
    packUnit: string | null;
  }[];
};

export type PurchaseOrderPreflightIssue = {
  row: number;
  field: string;
  message: string;
};

export type PurchaseOrderPreflightResult = {
  ok: boolean;
  rowCount: number;
  documentCount: number;
  lineCount: number;
  sourceTotals: { subtotal: number; tax: number; total: number; received: number };
  errors: PurchaseOrderPreflightIssue[];
  warnings: PurchaseOrderPreflightIssue[];
  /** Only returned for a completely valid export; never pass to a stock-mutating flow. */
  documents: PurchaseOrderImportSnapshot[];
};

const MAX_LINES = 10000;
const MAX_ISSUES = 50;
const STATUSES = new Set(["DRAFT", "ORDERED", "RECEIVED", "CANCELLED"]);

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

/**
 * Validate the exact exported PO schema and every document group before a
 * future importer is allowed to persist anything. Zero DB connections.
 */
export function preflightPurchaseOrderExport(rows: string[][]): PurchaseOrderPreflightResult {
  const errors: PurchaseOrderPreflightIssue[] = [];
  const warnings: PurchaseOrderPreflightIssue[] = [];
  const error = (row: number, field: string, message: string) => {
    if (errors.length < MAX_ISSUES) errors.push({ row, field, message });
  };
  const warning = (row: number, field: string, message: string) => {
    if (warnings.length < MAX_ISSUES) warnings.push({ row, field, message });
  };
  const result = (docs: PurchaseOrderImportSnapshot[], rowCount: number): PurchaseOrderPreflightResult => ({
    ok: errors.length === 0,
    rowCount,
    documentCount: docs.length,
    lineCount: docs.reduce((sum, po) => sum + po.lines.length, 0),
    sourceTotals: docs.reduce((a, po) => ({
      subtotal: a.subtotal + po.subtotal,
      tax: a.tax + po.tax,
      total: a.total + po.total,
      received: a.received + po.lines.reduce((n, line) => n + line.received, 0),
    }), { subtotal: 0, tax: 0, total: 0, received: 0 }),
    errors,
    warnings,
    documents: errors.length ? [] : docs,
  });

  const header = rows[0];
  if (!header) {
    error(1, "header", "CSVヘッダーがありません");
    return result([], 0);
  }
  if (rows.length - 1 > MAX_LINES) {
    error(1, "rows", "10,000明細行を超えるCSVは検証できません");
    return result([], rows.length - 1);
  }
  if (header.length !== new Set(header).size) {
    error(1, "header", "重複した列名があります");
    return result([], rows.length - 1);
  }
  const expected = PURCHASE_ORDER_EXPORT_HEADERS;
  if (header.length !== expected.length || expected.some(key => !header.includes(key))) {
    error(1, "header", "Stordexの仕入発注CSV出力と列構成が一致しません");
    return result([], rows.length - 1);
  }

  const index = new Map(header.map((key, i) => [key, i]));
  const grouped = new Map<string, { snapshot: PurchaseOrderImportSnapshot; firstRow: number }>();

  for (let i = 1; i < rows.length; i++) {
    const number = i + 1;
    const sourceRow = rows[i];
    if (sourceRow.length !== header.length) {
      error(number, "row", "列数がCSVヘッダーと一致しません");
      continue;
    }
    const get = (key: typeof expected[number]): string => sourceRow[index.get(key)!] ?? "";
    // Keep the raw field values for audit. Do not trim monetary numeric inputs
    // or silently treat malformed numbers as zero.
    const required = (field: typeof expected[number]) => {
      const value = get(field);
      if (!value.trim()) error(number, field, "必須項目が空です");
      return value;
    };
    const integer = (field: typeof expected[number], min: number): number => {
      const value = get(field);
      if (!/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value)) ||
          Number(value) < min) {
        error(number, field, min ? min + "以上の整数を指定してください" : "0以上の整数を指定してください");
        return Number.NaN;
      }
      return Number(value);
    };

    const poNumber = required("poNumber");
    const supplierCode = required("supplierCode");
    const supplierName = required("supplierName");
    const itemCode = required("itemCode");
    const itemName = required("itemName");
    const unit = required("unit");
    const orderDate = required("orderDate");
    const pickupDate = get("pickupDate") || null;
    const createdAt = required("createdAt");
    const updatedAt = required("updatedAt");
    const status = required("status");
    if (!validCalendarDate(orderDate)) error(number, "orderDate", "日付がYYYY-MM-DD形式の実在日付ではありません");
    if (pickupDate && !validCalendarDate(pickupDate)) error(number, "pickupDate", "引取予定日が不正です");
    if (!validTimestamp(createdAt)) error(number, "createdAt", "作成日時がISO UTC形式ではありません");
    if (!validTimestamp(updatedAt)) error(number, "updatedAt", "更新日時がISO UTC形式ではありません");
    if (!STATUSES.has(status)) error(number, "status", "未対応の発注状態です");

    const taxRate = integer("taxRate", 0);
    if (taxRate > 100) error(number, "taxRate", "税率が100%を超えています");
    const subtotal = integer("subtotal", 0);
    const tax = integer("tax", 0);
    const total = integer("total", 0);
    const quantity = integer("quantity", 1);
    const unitPrice = integer("unitPrice", 0);
    const amount = integer("amount", 0);
    const received = integer("received", 0);

    if (Number.isSafeInteger(quantity * unitPrice) && amount !== quantity * unitPrice) {
      error(number, "amount", "明細金額が数量×単価と一致しません");
    }
    if (!Number.isSafeInteger(quantity * unitPrice)) {
      error(number, "amount", "計算金額が安全な整数範囲を超えています");
    }

    const packValues = [get("packSize"), get("packCount"), get("packUnit")];
    const hasAnyPack = packValues.some(Boolean);
    const packSize = hasAnyPack ? integer("packSize", 2) : null;
    const packCount = hasAnyPack ? integer("packCount", 1) : null;
    const packUnit = hasAnyPack ? required("packUnit") : null;
    if (hasAnyPack && Number.isSafeInteger((packSize ?? 0) * (packCount ?? 0)) &&
        quantity !== (packSize ?? 0) * (packCount ?? 0)) {
      error(number, "packCount", "パック入数×箱数が発注個数と一致しません");
    }
    if (Number.isFinite(received) && Number.isFinite(quantity) && received > quantity) {
      warning(number, "received", "発注数を超える実入荷です。差異と在庫台帳の照合が必要です");
    }
    if (Number.isFinite(received) && received > 0 && status !== "RECEIVED") {
      warning(number, "status", "入荷済数量があるのに発注状態がRECEIVEDではありません。履歴の確認が必要です");
    }

    const common = {
      poNumber, supplierCode, supplierName, orderDate, pickupDate, status,
      note: get("note") || null, taxRate, subtotal, tax, total, createdAt, updatedAt,
    };
    const current = grouped.get(poNumber);
    const snapshot = current?.snapshot ?? {
      ...common,
      status: status as PurchaseOrderImportSnapshot["status"],
      lines: [] as PurchaseOrderImportSnapshot["lines"],
    };
    if (current && Object.entries(common).some(([key, value]) =>
      value !== snapshot[key as keyof typeof common])) {
      error(number, "poNumber", "同じ発注番号のヘッダー内容が明細間で一致しません");
    }
    snapshot.lines.push({
      itemCode, itemName, unit, quantity, unitPrice, amount, received,
      packSize, packCount, packUnit,
    });
    if (!current) grouped.set(poNumber, { snapshot, firstRow: number });
  }

  for (const { snapshot, firstRow } of grouped.values()) {
    const lineTotal = snapshot.lines.reduce((sum, line) => sum + line.amount, 0);
    if (!Number.isSafeInteger(lineTotal) || lineTotal !== snapshot.subtotal) {
      error(firstRow, "subtotal", "発注小計が全明細金額の合計と一致しません");
    }
    const calcTax = Math.floor((snapshot.subtotal * snapshot.taxRate) / 100);
    if (!Number.isSafeInteger(calcTax) || calcTax !== snapshot.tax) {
      error(firstRow, "tax", "発注税額が税込計算と一致しません");
    }
    if (!Number.isSafeInteger(snapshot.subtotal + snapshot.tax) ||
        snapshot.total !== snapshot.subtotal + snapshot.tax) {
      error(firstRow, "total", "発注合計が小計+税額と一致しません");
    }
  }

  return result([...grouped.values()].map(v => v.snapshot), rows.length - 1);
}
