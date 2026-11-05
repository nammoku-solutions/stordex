/**
 * Issue #82 — transition rules ONLY. Not a Server Action or state writer.
 *
 * A future state writer must acquire buyer PO -> trading connection ->
 * return request/lines locks, read physical events and issued-credit/payment
 * ledger from DB, re-run these rules and update the status atomically.
 */
import {
  assessB2BReturnProgress,
  type B2BReturnLineProgress,
} from "./b2b-return-progress";

type Status =
  | "SUBMITTED" | "UNDER_REVIEW" | "PARTIALLY_APPROVED" | "APPROVED"
  | "REJECTED" | "WITHDRAWN" | "DISPATCHED" | "PARTIALLY_INSPECTED"
  | "INSPECTED" | "CREDIT_PENDING" | "CLOSED";

export class B2BReturnTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "B2BReturnTransitionError";
  }
}
const edges: Readonly<Record<Status, readonly Status[]>> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED", "WITHDRAWN"],
  UNDER_REVIEW: ["APPROVED", "PARTIALLY_APPROVED", "REJECTED", "WITHDRAWN"],
  APPROVED: ["DISPATCHED"],
  PARTIALLY_APPROVED: ["DISPATCHED"],
  REJECTED: [],
  WITHDRAWN: [],
  DISPATCHED: ["PARTIALLY_INSPECTED", "INSPECTED"],
  PARTIALLY_INSPECTED: ["INSPECTED"],
  INSPECTED: ["CREDIT_PENDING"],
  CREDIT_PENDING: ["CLOSED"],
  CLOSED: [],
};

export function assessB2BReturnStatusTransition(input: {
  currentStatus: Status;
  targetStatus: Status;
  actorSide: "BUYER" | "SELLER";
  actorRole: "OWNER" | "ADMIN" | "STAFF";
  lines: readonly B2BReturnLineProgress[];
  /** Explicitly verified from settlement/credit-note ledger by a future writer. */
  financialResolution: "NOT_REVIEWED" | "SETTLED_AND_RECONCILED" | "NO_CREDIT_DUE_AUDITED";
  settlementLedgerVerified: boolean;
  closeReason: string | null;
}): {
  status: "TRANSITION_CHECKS_PASSED_NOT_SAVED";
  from: Status;
  to: Status;
  message: string;
} {
  if (!Object.hasOwn(edges, input.currentStatus) ||
      !Object.hasOwn(edges, input.targetStatus) ||
      !edges[input.currentStatus].includes(input.targetStatus)) {
    throw new B2BReturnTransitionError(
      "返品ステータスの飛び越し・再設定・終了後の変更は禁止です",
    );
  }
  if (!["OWNER", "ADMIN"].includes(input.actorRole)) {
    throw new B2BReturnTransitionError("管理者権限が必要です");
  }
  const buyerTargets: readonly Status[] = ["WITHDRAWN", "DISPATCHED"];
  const expected = buyerTargets.includes(input.targetStatus) ? "BUYER" : "SELLER";
  if (input.actorSide !== expected) {
    throw new B2BReturnTransitionError(
      "この段階の更新は対応する買い手・売り手企業だけが実行できます",
    );
  }
  const progress = assessB2BReturnProgress({
    status: input.currentStatus, lines: input.lines,
  });
  const n = progress.summary;
  if (input.targetStatus === "APPROVED" ||
      input.targetStatus === "PARTIALLY_APPROVED") {
    if (n.approved === 0 ||
        (input.targetStatus === "APPROVED" && n.approved !== n.requested) ||
        (input.targetStatus === "PARTIALLY_APPROVED" && n.approved >= n.requested)) {
      throw new B2BReturnTransitionError("売り手の審査結果と承認数量が一致しません");
    }
  }
  if (input.targetStatus === "REJECTED" && n.approved !== 0) {
    throw new B2BReturnTransitionError("承認済みの数量がある返品は否認できません");
  }
  if (input.targetStatus === "DISPATCHED" && n.dispatched === 0) {
    throw new B2BReturnTransitionError("買い手の実返送イベントがありません");
  }
  if (input.targetStatus === "PARTIALLY_INSPECTED" &&
      (n.inspected === 0 || n.inspected >= n.approved)) {
    throw new B2BReturnTransitionError("一部検品状態と実検品数量が一致しません");
  }
  if (["INSPECTED", "CREDIT_PENDING", "CLOSED"].includes(input.targetStatus) &&
      (n.approved === 0 || n.dispatched !== n.approved ||
       n.inspected !== n.approved)) {
    throw new B2BReturnTransitionError("すべての承認済み返品の返送・検品が完了していません");
  }
  if (input.targetStatus === "CLOSED") {
    if (!input.settlementLedgerVerified ||
        !["SETTLED_AND_RECONCILED", "NO_CREDIT_DUE_AUDITED"].includes(input.financialResolution)) {
      throw new B2BReturnTransitionError(
        "CreditNote発行・精算履歴または調整不要の独立監査が完了していません",
      );
    }
    const note = input.closeReason?.trim() ?? "";
    if (!note || note.length > 1000) {
      throw new B2BReturnTransitionError("完了理由を1〜1000文字で記録してください");
    }
  }
  return {
    status: "TRANSITION_CHECKS_PASSED_NOT_SAVED",
    from: input.currentStatus, to: input.targetStatus,
    message: "遷移条件の事前検証のみ完了。DB更新・在庫移動・精算処理は実施していません。",
  };
}
