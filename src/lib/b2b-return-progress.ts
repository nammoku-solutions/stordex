/**
 * Issue #82 — purely observational return progress. This does not mutate
 * B2BReturnRequest.status; status writers remain blocked behind approved DB
 * migrations and audited transactional event posting.
 */
type ReviewState =
  | "SUBMITTED" | "UNDER_REVIEW" | "PARTIALLY_APPROVED" | "APPROVED"
  | "REJECTED" | "WITHDRAWN" | "DISPATCHED" | "PARTIALLY_INSPECTED"
  | "INSPECTED" | "CREDIT_PENDING" | "CLOSED";

export type ReturnProgressPhase =
  | "WAITING_REVIEW" | "REJECTED" | "WITHDRAWN" | "AWAITING_DISPATCH"
  | "IN_TRANSIT" | "PARTIALLY_INSPECTED" | "PARTIALLY_RETURNED"
  | "AWAITING_CREDIT_REVIEW" | "CLOSED_MANUALLY";

export class ReturnProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReturnProgressError";
  }
}

const INT_MAX = 2_147_483_647;
function quantity(n: number, name: string) {
  if (!Number.isSafeInteger(n) || n < 0 || n > INT_MAX) {
    throw new ReturnProgressError(name + "は0以上の整数で指定してください");
  }
  return n;
}
export type B2BReturnLineProgress = {
  id: string;
  requested: number;
  approved: number;
  dispatched: number;
  inspected: number;
  /** This is allocated to DRAFT credit proposals, NOT an issued credit. */
  draftCreditAllocated: number;
};

export function assessB2BReturnProgress(input: {
  status: ReviewState;
  lines: readonly B2BReturnLineProgress[];
}): {
  phase: ReturnProgressPhase;
  summary: {
    requested: number;
    approved: number;
    dispatched: number;
    inspected: number;
    draftCreditAllocated: number;
    notYetDispatched: number;
    inTransit: number;
    inspectedUnallocated: number;
  };
  /** Never represents a payment, tax or refund instruction. */
  canConsiderCreditDraft: boolean;
  warning: string;
} {
  if (!input.lines.length || input.lines.length > 100) {
    throw new ReturnProgressError("返品明細は1〜100件を指定してください");
  }
  const statuses: readonly ReviewState[] = [
    "SUBMITTED", "UNDER_REVIEW", "PARTIALLY_APPROVED", "APPROVED",
    "REJECTED", "WITHDRAWN", "DISPATCHED", "PARTIALLY_INSPECTED",
    "INSPECTED", "CREDIT_PENDING", "CLOSED",
  ];
  if (!statuses.includes(input.status)) {
    throw new ReturnProgressError("返品ステータスが不正です");
  }
  const seen = new Set<string>();
  const summary = {
    requested: 0, approved: 0, dispatched: 0,
    inspected: 0, draftCreditAllocated: 0,
    notYetDispatched: 0, inTransit: 0, inspectedUnallocated: 0,
  };
  for (const line of input.lines) {
    if (!line.id?.trim() || seen.has(line.id)) {
      throw new ReturnProgressError("返品明細IDが不正、または重複しています");
    }
    seen.add(line.id);
    const requested = quantity(line.requested, "申請数量");
    const approved = quantity(line.approved, "承認数量");
    const dispatched = quantity(line.dispatched, "返送数量");
    const inspected = quantity(line.inspected, "検品数量");
    const draftCreditAllocated = quantity(line.draftCreditAllocated, "調整案の割当数量");
    if (requested < 1 || approved > requested || dispatched > approved ||
        inspected > dispatched || draftCreditAllocated > inspected) {
      throw new ReturnProgressError("申請・承認・返送・検品・調整案数量が矛盾しています");
    }
    // Integers stored in PostgreSQL are int4 per row. Accumulated totals can
    // exceed int4 while still being safe JS integers; guard safe addition.
    const updates = {
      requested, approved, dispatched, inspected, draftCreditAllocated,
      notYetDispatched: approved - dispatched,
      inTransit: dispatched - inspected,
      inspectedUnallocated: inspected - draftCreditAllocated,
    };
    for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
      const next = summary[key] + updates[key];
      if (!Number.isSafeInteger(next)) {
        throw new ReturnProgressError("合計数量が整数の上限を超えています");
      }
      summary[key] = next;
    }
  }
  const beforeApproval = input.status === "SUBMITTED" || input.status === "UNDER_REVIEW";
  const terminalNoReturn = input.status === "REJECTED" || input.status === "WITHDRAWN";
  if ((beforeApproval || terminalNoReturn) &&
      (summary.approved !== 0 || summary.dispatched !== 0 ||
       summary.inspected !== 0 || summary.draftCreditAllocated !== 0)) {
    throw new ReturnProgressError("申請ステータスと実際の返品処理が一致しません");
  }
  if (input.status === "CLOSED" && (
      summary.approved === 0 ||
      summary.dispatched !== summary.approved ||
      summary.inspected !== summary.dispatched)) {
    throw new ReturnProgressError("未返送・未検品の返品を完了と表示できません");
  }
  let phase: ReturnProgressPhase;
  if (beforeApproval) phase = "WAITING_REVIEW";
  else if (input.status === "REJECTED") phase = "REJECTED";
  else if (input.status === "WITHDRAWN") phase = "WITHDRAWN";
  else if (input.status === "CLOSED") phase = "CLOSED_MANUALLY";
  else if (summary.approved === 0) {
    throw new ReturnProgressError("承認済み返品に承認数量がありません");
  } else if (summary.dispatched === 0) phase = "AWAITING_DISPATCH";
  else if (summary.inTransit > 0 && summary.inspected === 0) phase = "IN_TRANSIT";
  else if (summary.inTransit > 0) phase = "PARTIALLY_INSPECTED";
  else if (summary.notYetDispatched > 0) phase = "PARTIALLY_RETURNED";
  else phase = "AWAITING_CREDIT_REVIEW";

  const canConsiderCreditDraft = summary.inspectedUnallocated > 0 &&
    !beforeApproval && !terminalNoReturn && input.status !== "CLOSED";
  return {
    phase, summary, canConsiderCreditDraft,
    warning: canConsiderCreditDraft
      ? "検品済みの数量があります。クレジットノート下書きは会計確認後に作成してください。発行・返金はされません。"
      : "申請・承認・返送・検品・調整案の記録は会計上の返金確定を意味しません。",
  };
}

/**
 * The display can identify possible next work, but must never treat a paid
 * invoice as permission to refund or an issued one as permission to offset.
 */
export type B2BFinancialNextStep =
  | "NO_CREDIT_REVIEW" | "RECONCILE_SOURCE_INVOICE" | "REVIEW_SETTLEMENT_METHOD";
export function assessB2BFinancialNextStep(input: {
  hasInspectedUnallocatedUnits: boolean;
  invoiceStatus: "NONE" | "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";
  /** A credit note is never legally issued by these planning functions. */
  creditStatus?: "NONE" | "DRAFT" | "RECONCILED" | "ISSUED" | "APPLIED" | "VOID";
}): { next: B2BFinancialNextStep; message: string } {
  if (!input.hasInspectedUnallocatedUnits) {
    return { next: "NO_CREDIT_REVIEW", message: "調整可能な検品済み未割当数量はありません。" };
  }
  if (input.invoiceStatus !== "ISSUED" && input.invoiceStatus !== "PAID") {
    return {
      next: "RECONCILE_SOURCE_INVOICE",
      message: "発行済みの元請求書と返品対象受注の対応関係を確認してください。",
    };
  }
  if (!input.creditStatus || input.creditStatus === "NONE" || input.creditStatus === "DRAFT") {
    return {
      next: "RECONCILE_SOURCE_INVOICE",
      message: "元請求書の税計算・入金状況とクレジットノートの調整案を照合してください。",
    };
  }
  return {
    next: "REVIEW_SETTLEMENT_METHOD",
    message: "返金と請求相殺は別の取引です。元入金・未回収額・二重処理を確認し、承認された方法を選択してください。",
  };
}
