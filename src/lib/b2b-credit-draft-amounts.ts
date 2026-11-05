/**
 * Issue #82 — conservative, PURE monetary bounds for DRAFT credit proposals.
 *
 * Amounts are supplied by an authorized human after reading the original
 * invoice. This never derives tax from unit price, authorizes a credit note,
 * posts to accounts receivable, or processes a refund.
 *
 * Each amount uses the same integer unit as the original Invoice. Currency
 * minor units, applicable tax allocation rules, rounding and legal numbering
 * must be reviewed separately before any issued CreditNote is possible.
 */
const MAX = 2_147_483_647;
const CURRENCY = /^[A-Z]{3}$/;

export class B2BCreditDraftAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "B2BCreditDraftAmountError";
  }
}

function money(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX) {
    throw new B2BCreditDraftAmountError(
      `${label}は0〜2,147,483,647の整数である必要があります`,
    );
  }
  return value;
}
function accumulate(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum) || sum > MAX) {
    throw new B2BCreditDraftAmountError("金額の合計が保存できる上限を超えました");
  }
  return sum;
}
type Amounts = { subtotal: number; tax: number; total: number };
function amounts(value: Amounts, label: string): Amounts {
  const subtotal = money(value.subtotal, label + "税抜額");
  const tax = money(value.tax, label + "税額");
  const total = money(value.total, label + "税込額");
  if (accumulate(subtotal, tax) !== total) {
    throw new B2BCreditDraftAmountError(label + "の税抜額・税額・税込額が一致しません");
  }
  return { subtotal, tax, total };
}

export function validateB2BCreditDraftAmounts(input: {
  currencyCode: string;
  originalInvoice: Amounts & {
    status: "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";
    taxRate: number;
    taxPerOrder: boolean;
  };
  /** Already committed or proposed amount against this invoice in ALL
   * other active credit notes, not merely the current return request. */
  priorCreditAmounts: Amounts;
  lines: readonly (Amounts & {
    returnLineId: string;
    alreadyInspectedUnallocated: number;
    creditedQuantity: number;
  })[];
  taxAllocationExplanation: string;
}): {
  status: "MANUAL_ACCOUNTING_REVIEW_REQUIRED";
  proposed: Amounts;
  remainingInvoiceCapacity: Amounts;
  taxPerOrder: boolean;
  message: string;
} {
  if (!CURRENCY.test(input.currencyCode)) {
    throw new B2BCreditDraftAmountError("通貨コードを3文字のISO形式で指定してください");
  }
  if (!["ISSUED", "PAID"].includes(input.originalInvoice.status)) {
    throw new B2BCreditDraftAmountError(
      "未発行・取消済みの請求書にCreditNoteの下書きは作成できません",
    );
  }
  if (!Number.isSafeInteger(input.originalInvoice.taxRate) ||
      input.originalInvoice.taxRate < 0 || input.originalInvoice.taxRate > 100 ||
      typeof input.originalInvoice.taxPerOrder !== "boolean") {
    throw new B2BCreditDraftAmountError("元請求書の税率・税計算方法を確認してください");
  }
  const original = amounts(input.originalInvoice, "元請求書");
  const prior = amounts(input.priorCreditAmounts, "既存の金額調整");
  if (!input.lines.length || input.lines.length > 100) {
    throw new B2BCreditDraftAmountError("金額調整の明細は1〜100件で指定してください");
  }
  const explanation = input.taxAllocationExplanation?.trim() ?? "";
  if (!explanation || explanation.length > 1000) {
    throw new B2BCreditDraftAmountError("税額配賦の根拠を1〜1000文字で入力してください");
  }
  const keys = new Set<string>();
  const proposed: Amounts = { subtotal: 0, tax: 0, total: 0 };
  for (const line of input.lines) {
    if (!line.returnLineId?.trim() || keys.has(line.returnLineId)) {
      throw new B2BCreditDraftAmountError("返品明細が不正、または重複しています");
    }
    keys.add(line.returnLineId);
    const available = money(line.alreadyInspectedUnallocated, "未調整の実検品数");
    const quantity = money(line.creditedQuantity, "今回の調整数量");
    if (quantity === 0 || quantity > available) {
      throw new B2BCreditDraftAmountError(
        "調整数量が実検品済み・未調整の数量を超えています",
      );
    }
    const current = amounts(line, "調整明細");
    proposed.subtotal = accumulate(proposed.subtotal, current.subtotal);
    proposed.tax = accumulate(proposed.tax, current.tax);
    proposed.total = accumulate(proposed.total, current.total);
  }
  if (proposed.total === 0) {
    throw new B2BCreditDraftAmountError("0金額のCreditNote案は作成できません");
  }
  const committed: Amounts = {
    subtotal: accumulate(prior.subtotal, proposed.subtotal),
    tax: accumulate(prior.tax, proposed.tax),
    total: accumulate(prior.total, proposed.total),
  };
  if (committed.subtotal > original.subtotal ||
      committed.tax > original.tax || committed.total > original.total) {
    throw new B2BCreditDraftAmountError(
      "既存の金額調整と今回の案の合計が元請求書の金額を超えています",
    );
  }
  return {
    status: "MANUAL_ACCOUNTING_REVIEW_REQUIRED",
    proposed,
    remainingInvoiceCapacity: {
      subtotal: original.subtotal - committed.subtotal,
      tax: original.tax - committed.tax,
      total: original.total - committed.total,
    },
    taxPerOrder: input.originalInvoice.taxPerOrder,
    message: "下書きの上限検証のみ完了。税額配賦・端数・入金済み金額・通貨単位を確認するまで発行・返金は禁止です。",
  };
}
