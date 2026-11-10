/** Only the explicit, audited physical status transitions are accepted. */
export class ReturnStatusReconcileFormError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReturnStatusReconcileFormError";
  }
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDGES: Readonly<Record<string, readonly string[]>> = {
  APPROVED: ["DISPATCHED"],
  PARTIALLY_APPROVED: ["DISPATCHED"],
  DISPATCHED: ["PARTIALLY_INSPECTED", "INSPECTED"],
  PARTIALLY_INSPECTED: ["INSPECTED"],
};
export type Source = "APPROVED" | "PARTIALLY_APPROVED" |
  "DISPATCHED" | "PARTIALLY_INSPECTED";
export type Target = "DISPATCHED" | "PARTIALLY_INSPECTED" | "INSPECTED";

function single(data: FormData, key: string): string {
  const value = data.getAll(key);
  if (value.length !== 1 || typeof value[0] !== "string") {
    throw new ReturnStatusReconcileFormError(key + "の入力が不正です");
  }
  return value[0];
}

export function parseReturnStatusReconcileForm(data: FormData): {
  returnRequestId: string; eventId: string; expectedStatus: Source; targetStatus: Target;
} {
  const returnRequestId = single(data, "returnRequestId");
  const eventId = single(data, "eventId").toLowerCase();
  const expectedStatus = single(data, "expectedStatus");
  const targetStatus = single(data, "targetStatus");
  const confirmed = single(data, "confirmed");
  if (!ID.test(returnRequestId) || !UUID.test(eventId) ||
      !EDGES[expectedStatus]?.includes(targetStatus) || confirmed !== "yes") {
    throw new ReturnStatusReconcileFormError(
      "返品申請・現在の状態・同期先・確認内容が不正です",
    );
  }
  return {
    returnRequestId, eventId,
    expectedStatus: expectedStatus as Source,
    targetStatus: targetStatus as Target,
  };
}
