/**
 * Issue #82 — pure guards for return quantities.
 *
 * These functions DO NOT read/write stock or authorize an operation. Event
 * writers must re-fetch under shared order/PO locks in one transaction,
 * perform idempotent state claims, and only then append movement records.
 */
export const RETURN_INT_MAX = 2_147_483_647;

export class ReturnQuantityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReturnQuantityError";
  }
}

function integer(name: string, value: number, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > RETURN_INT_MAX) {
    throw new ReturnQuantityError(
      `${name}は${minimum}〜2,147,483,647の整数である必要があります`,
    );
  }
  return value;
}

export function planB2BReturnQuantity(input: {
  sellerOrderItemId: string | null;
  originalOrdered: number;
  sellerShipped: number;
  buyerReceived: number;
  /** Sum of all open and completed return quantities for this SOURCE line.
   * Rejected/withdrawn quantities must not be counted as committed. */
  alreadyCommitted: number;
  requested: number;
}): { sourceLimit: number; available: number; afterRequest: number } {
  if (!input.sellerOrderItemId?.trim()) {
    throw new ReturnQuantityError(
      "売り手受注明細の紐付けがありません。過去取引の返品は手動照合が必要です",
    );
  }
  const ordered = integer("元発注数量", input.originalOrdered, 1);
  const shipped = integer("売り手出荷数量", input.sellerShipped);
  const received = integer("買い手実入荷数量", input.buyerReceived);
  const committed = integer("申請済み返品数量", input.alreadyCommitted);
  const requested = integer("今回の返品数量", input.requested, 1);
  if (shipped > ordered || received > ordered) {
    throw new ReturnQuantityError(
      "元発注より出荷・入荷が多いため、数量差異の手動照合が必要です",
    );
  }
  const sourceLimit = Math.min(ordered, shipped, received);
  if (committed > sourceLimit) {
    throw new ReturnQuantityError(
      "既存の返品申請合計が実入荷・出荷数量を超えています",
    );
  }
  const available = sourceLimit - committed;
  if (requested > available) {
    throw new ReturnQuantityError(
      `返品申請の残数量を超えています（残り${available}）`,
    );
  }
  return { sourceLimit, available, afterRequest: available - requested };
}

export function validateB2BReturnDispatch(input: {
  approved: number;
  alreadyDispatched: number;
  dispatch: number;
  currentBuyerStock: number;
}): { remainingApproved: number; newBuyerStock: number } {
  const approved = integer("承認済み返品数量", input.approved, 1);
  const previous = integer("返送済み数量", input.alreadyDispatched);
  const dispatch = integer("今回の返送数量", input.dispatch, 1);
  const stock = integer("現在庫", input.currentBuyerStock);
  if (previous > approved || dispatch > approved - previous) {
    throw new ReturnQuantityError("承認済み返品数量を超える返送はできません");
  }
  if (dispatch > stock) {
    throw new ReturnQuantityError("現在庫が不足しています。数量を確認してください");
  }
  return { remainingApproved: approved - previous - dispatch, newBuyerStock: stock - dispatch };
}

export function validateB2BReturnInspection(input: {
  dispatched: number;
  alreadyInspected: number;
  receivedNow: number;
  saleable: number;
  unsaleable: number;
}): { remainingInTransit: number; sellerRestock: number; quarantine: number } {
  const dispatched = integer("返送済み数量", input.dispatched, 1);
  const inspected = integer("検品済み数量", input.alreadyInspected);
  const received = integer("今回の現物受領数量", input.receivedNow, 1);
  const saleable = integer("良品数量", input.saleable);
  const unsaleable = integer("不良品数量", input.unsaleable);
  if (inspected > dispatched || received > dispatched - inspected) {
    throw new ReturnQuantityError("返送済数量を超えて受領・検品できません");
  }
  if (saleable + unsaleable !== received) {
    throw new ReturnQuantityError("良品数と不良品数の合計が受領数量と一致しません");
  }
  return {
    remainingInTransit: dispatched - inspected - received,
    sellerRestock: saleable,
    quarantine: unsaleable,
  };
}
