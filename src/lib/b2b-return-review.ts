/**
 * Issue #82 — pure seller review rules for a single post-shipment B2B
 * return request. No database writes or credentials: a future server action
 * must re-read/lock the return request and underlying PO and validate actor
 * role/tenant, partner connection, pending commitments and source quantity.
 */
export type B2BReturnReviewLine = {
  sourceLineId: string;
  requestedQuantity: number;
  approvedQuantity: number;
};

export type B2BReturnReviewDecision = {
  status: "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED";
  totalRequested: number;
  totalApproved: number;
  rejectedLineCount: number;
  reviewNote: string | null;
};

export class B2BReturnReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "B2BReturnReviewError";
  }
}

const INT4_MAX = 2_147_483_647;
const MAX_LINES = 100;

export function assessB2BReturnReview(input: {
  currentStatus: string;
  lines: readonly B2BReturnReviewLine[];
  reviewNote?: string | null;
}): B2BReturnReviewDecision {
  if (!["SUBMITTED", "UNDER_REVIEW"].includes(input.currentStatus)) {
    throw new B2BReturnReviewError(
      "この返品申請はすでに処理済み、または審査対象外です。最新の状態をご確認ください",
    );
  }
  if (input.lines.length < 1 || input.lines.length > MAX_LINES) {
    throw new B2BReturnReviewError("返品明細がないか、1回の審査上限を超えています");
  }
  const note = input.reviewNote?.trim() ?? "";
  if (note.length > 500) {
    throw new B2BReturnReviewError("審査コメントは500文字以内で入力してください");
  }
  const keys = new Set<string>();
  let totalRequested = 0;
  let totalApproved = 0;
  let rejectedLineCount = 0;
  for (const line of input.lines) {
    if (!line.sourceLineId.trim() || keys.has(line.sourceLineId)) {
      throw new B2BReturnReviewError("返品対象の明細IDが不正、または重複しています");
    }
    keys.add(line.sourceLineId);
    if (!Number.isSafeInteger(line.requestedQuantity) ||
        line.requestedQuantity < 1 || line.requestedQuantity > INT4_MAX ||
        !Number.isSafeInteger(line.approvedQuantity) ||
        line.approvedQuantity < 0 || line.approvedQuantity > line.requestedQuantity) {
      throw new B2BReturnReviewError("承認数量は各明細の申請数量以下の0以上の整数で指定してください");
    }
    totalRequested += line.requestedQuantity;
    totalApproved += line.approvedQuantity;
    if (line.approvedQuantity < line.requestedQuantity) rejectedLineCount++;
  }
  if (!Number.isSafeInteger(totalRequested) ||
      !Number.isSafeInteger(totalApproved)) {
    throw new B2BReturnReviewError("合計数量が安全な整数範囲を超えています");
  }
  if (rejectedLineCount > 0 && !note) {
    throw new B2BReturnReviewError(
      "一部承認・否認の場合は理由を審査コメントに入力してください",
    );
  }
  return {
    status: totalApproved === 0 ? "REJECTED"
      : totalApproved === totalRequested ? "APPROVED"
        : "PARTIALLY_APPROVED",
    totalRequested, totalApproved, rejectedLineCount,
    reviewNote: note || null,
  };
}
