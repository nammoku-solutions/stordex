/**
 * Read-only UI hint. Real authorization/evidence checks live in
 * recordPhysicalReturnStatus's SERIALIZABLE transaction and database guard.
 */
type Stage = "APPROVED" | "PARTIALLY_APPROVED" | "DISPATCHED" |
  "PARTIALLY_INSPECTED" | "INSPECTED" | string;
type Target = "DISPATCHED" | "PARTIALLY_INSPECTED" | "INSPECTED";
export function suggestReturnStatusReconciliation(input: {
  status: Stage;
  actorSide: "BUYER" | "SELLER";
  lines: readonly { approved: number; dispatched: number; inspected: number }[];
}): Target | null {
  if (!input.lines.length || input.lines.length > 100) return null;
  if (input.lines.some(x =>
    ![x.approved,x.dispatched,x.inspected].every(n => Number.isSafeInteger(n) && n >= 0) ||
    x.dispatched > x.approved || x.inspected > x.dispatched
  )) return null;
  const approved = input.lines.reduce((n,x)=>n+x.approved,0);
  const dispatched = input.lines.reduce((n,x)=>n+x.dispatched,0);
  const inspected = input.lines.reduce((n,x)=>n+x.inspected,0);
  if (![approved,dispatched,inspected].every(Number.isSafeInteger) || approved < 1) {
    return null;
  }

  if (input.actorSide === "BUYER" &&
      (input.status === "APPROVED" || input.status === "PARTIALLY_APPROVED") &&
      dispatched > 0) return "DISPATCHED";

  if (input.actorSide === "SELLER" &&
      (input.status === "DISPATCHED" || input.status === "PARTIALLY_INSPECTED")) {
    const complete = input.lines.every(x =>
      x.inspected === x.approved && x.dispatched === x.approved);
    if (complete) return "INSPECTED";
    if (input.status === "DISPATCHED" && inspected > 0 && inspected < approved) {
      return "PARTIALLY_INSPECTED";
    }
  }
  return null;
}
