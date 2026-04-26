// 受注・見積・発注の金額計算（純粋関数: DB 非依存・テスト容易）

export type LineInput = { quantity: number; unitPrice: number };

export type OrderTotals = {
  subtotal: number;
  tax: number;
  total: number;
  lines: Array<LineInput & { amount: number }>;
};

/**
 * 小計・税・合計を計算する。
 * - amount = quantity * unitPrice（円・整数）
 * - tax = floor(subtotal * taxRate / 100)（端数切捨て）
 * - total = subtotal + tax
 */
export function computeTotals(lines: LineInput[], taxRate: number): OrderTotals {
  if (!Number.isFinite(taxRate) || taxRate < 0) {
    throw new Error("taxRate は 0 以上の数値で指定してください");
  }
  let subtotal = 0;
  const out = lines.map((l) => {
    if (l.quantity < 0) throw new Error("数量は 0 以上である必要があります");
    if (l.unitPrice < 0) throw new Error("単価は 0 以上である必要があります");
    const amount = Math.round(l.quantity * l.unitPrice);
    subtotal += amount;
    return { ...l, amount };
  });
  const tax = Math.floor((subtotal * taxRate) / 100);
  return { subtotal, tax, total: subtotal + tax, lines: out };
}

/**
 * 連番付き伝票番号: PREFIX-YYYYMMDD-NNNN
 * 既存の最大番号を渡すと次番号を返す。
 */
export function nextSequentialNumber(
  prefix: string,
  date: Date,
  lastNumber: string | null
): string {
  const yyyymmdd =
    date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, "0") +
    String(date.getDate()).padStart(2, "0");
  const head = `${prefix}-${yyyymmdd}-`;
  let seq = 1;
  if (lastNumber && lastNumber.startsWith(head)) {
    seq = parseInt(lastNumber.slice(head.length), 10) + 1;
  }
  return `${head}${String(seq).padStart(4, "0")}`;
}
