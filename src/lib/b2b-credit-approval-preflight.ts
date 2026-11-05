/**
 * Issue #82 — CreditNote DRAFT reconciliation checklist, PURE ONLY.
 *
 * The DRAFT migration explicitly forbids non-DRAFT statuses. A passing
 * result never authorizes issuance, settlement, an invoice write, or a
 * refund. All identity/evidence inputs must be re-read and validated inside
 * the future tenant-scoped transactional service (NOT from FormData).
 */
const MAX_INT = 2_147_483_647;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const CURRENCY = /^[A-Z]{3}$/;

export type CreditMoney = { subtotal: number; tax: number; total: number };
export class CreditApprovalPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditApprovalPreflightError";
  }
}
function fail(message: string): never {
  throw new CreditApprovalPreflightError(message);
}
function amount(n: number, label: string): number {
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_INT) {
    fail(label + "は0以上の安全な整数で入力してください");
  }
  return n;
}
function verifiedAmounts(data: CreditMoney, label: string): CreditMoney {
  const subtotal = amount(data.subtotal, label + "税抜額");
  const tax = amount(data.tax, label + "税額");
  const total = amount(data.total, label + "合計");
  if (subtotal + tax !== total) {
    fail(label + "の税抜額・税額・合計が一致しません");
  }
  return { subtotal, tax, total };
}
function sumMoney(a: CreditMoney, b: CreditMoney): CreditMoney {
  return verifiedAmounts({
    subtotal: a.subtotal + b.subtotal,
    tax: a.tax + b.tax,
    total: a.total + b.total,
  }, "累積調整額");
}

export function assessB2BCreditApprovalPreflight(input: {
  sellerTenantId: string;
  invoiceTenantId: string;
  reviewerTenantId: string;
  authorUserId: string;
  reviewerUserId: string;
  reviewerRole: "OWNER" | "ADMIN" | "STAFF";
  invoiceStatus: "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";
  creditStatus: "DRAFT" | "RECONCILED" | "ISSUED" | "APPLIED" | "VOID";
  currencyCode: string;
  originalInvoice: CreditMoney;
  creditProposal: CreditMoney;
  /** Other active credits for the SAME invoice, excluding this proposal. */
  otherActiveCredits: CreditMoney;
  /** Each line amount must match the reconciled source. */
  lines: readonly (CreditMoney & {
    sourceReturnLineId: string;
    creditedUnits: number;
    physicallyInspectedUnits: number;
    /** Excludes THIS draft, includes allocations by every other credit note. */
    otherReservedUnits: number;
  })[];
  taxAllocationExplanation: string;
  reviewNote: string;
  evidence: {
    invoiceContainsSellerOrder: boolean;
    sourceInvoiceSnapshotMatches: boolean;
    taxBasisAndRoundingReviewed: boolean;
    currencyMinorUnitsReviewed: boolean;
    priorCreditsAndPaymentsReconciled: boolean;
  };
}): {
  status: "CHECKS_PASSED_NOT_APPROVED";
  proposed: CreditMoney;
  remainingInvoiceCapacity: CreditMoney;
  reviewedLineCount: number;
  message: string;
} {
  for (const [label, value] of [
    ["売り手企業", input.sellerTenantId],
    ["請求書の企業", input.invoiceTenantId],
    ["審査担当企業", input.reviewerTenantId],
    ["下書き作成者", input.authorUserId],
    ["審査担当者", input.reviewerUserId],
  ] as const) {
    if (!ID.test(value)) fail(label + "が不正です");
  }
  if (input.sellerTenantId !== input.invoiceTenantId ||
      input.sellerTenantId !== input.reviewerTenantId) {
    fail("元請求書・売り手・審査担当者の企業が一致しません");
  }
  if (input.authorUserId === input.reviewerUserId ||
      !["OWNER", "ADMIN"].includes(input.reviewerRole)) {
    fail("作成者と異なる売り手管理者による独立審査が必要です");
  }
  if (input.creditStatus !== "DRAFT" ||
      !["ISSUED", "PAID"].includes(input.invoiceStatus)) {
    fail("未発行のCreditNote下書きと有効な元請求書だけを審査できます");
  }
  if (!CURRENCY.test(input.currencyCode)) fail("通貨コードを確認してください");
  if (Object.values(input.evidence).some(value => value !== true)) {
    fail("元請求書・税額・通貨単位・過去調整・入金記録の照合が未完了です");
  }
  const explanation = input.taxAllocationExplanation?.trim() ?? "";
  const reviewNote = input.reviewNote?.trim() ?? "";
  if (!explanation || explanation.length > 1000 ||
      !reviewNote || reviewNote.length > 1000) {
    fail("税額配賦の根拠と独立審査コメントは1〜1000文字で入力してください");
  }
  const original = verifiedAmounts(input.originalInvoice, "元請求書");
  const proposed = verifiedAmounts(input.creditProposal, "今回の調整案");
  const prior = verifiedAmounts(input.otherActiveCredits, "既存の調整案");
  if (proposed.total === 0) fail("0金額の調整案は審査できません");
  if (input.lines.length < 1 || input.lines.length > 100) {
    fail("調整明細は1〜100件を指定してください");
  }
  const ids = new Set<string>();
  let calculated: CreditMoney = { subtotal: 0, tax: 0, total: 0 };
  for (const line of input.lines) {
    if (!ID.test(line.sourceReturnLineId) || ids.has(line.sourceReturnLineId)) {
      fail("調整明細IDが不正、または重複しています");
    }
    ids.add(line.sourceReturnLineId);
    const credited = amount(line.creditedUnits, "調整数量");
    const inspected = amount(line.physicallyInspectedUnits, "物理検品済み数量");
    const otherReserved = amount(line.otherReservedUnits, "他の下書きの予約数量");
    if (otherReserved > inspected || credited < 1 || credited > inspected - otherReserved) {
      fail("調整数量が検品済み未割当数量を超えています");
    }
    calculated = sumMoney(calculated, verifiedAmounts(line, "調整明細"));
  }
  if (calculated.subtotal !== proposed.subtotal ||
      calculated.tax !== proposed.tax || calculated.total !== proposed.total) {
    fail("調整明細の合計とCreditNote下書きの合計が一致しません");
  }
  const allocated = sumMoney(prior, proposed);
  if (allocated.subtotal > original.subtotal || allocated.tax > original.tax ||
      allocated.total > original.total) {
    fail("過去調整案を含む合計が元請求書の金額を超えています");
  }
  return {
    status: "CHECKS_PASSED_NOT_APPROVED",
    proposed,
    remainingInvoiceCapacity: {
      subtotal: original.subtotal - allocated.subtotal,
      tax: original.tax - allocated.tax,
      total: original.total - allocated.total,
    },
    reviewedLineCount: ids.size,
    message: "事前照合のみ完了。正式承認、CreditNote発行、請求相殺・返金はまだ実施されていません。",
  };
}
