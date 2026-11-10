/**
 * Issue #82 — pure event preparation. Does not reserve a return event or
 * update inventory. The future writer MUST claim (tenant, phase, eventId)
 * under an approved schema unique constraint, re-check the linked source
 * return line and inventory while holding row locks, then write an
 * InventoryMovement and event record in the SAME transaction.
 */
import { createHash } from "node:crypto";
import {
  RETURN_INT_MAX,
  validateB2BReturnDispatch,
  validateB2BReturnInspection,
} from "./b2b-return-quantity";

type Phase = "DISPATCH" | "INSPECTION";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export class ReturnEventPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReturnEventPlanError";
  }
}
function checkId(value: string, label: string): void {
  if (!ID.test(value)) throw new ReturnEventPlanError(label + "が不正です");
}
function eventScope(input: {
  eventId: string; tenantId: string; returnLineId: string; phase: Phase;
  itemId: string; quantities: number[];
}): { eventId: string; payloadHash: string } {
  if (!UUID.test(input.eventId)) {
    throw new ReturnEventPlanError("イベントIDはUUIDで指定してください");
  }
  checkId(input.tenantId, "企業ID");
  checkId(input.returnLineId, "返品明細ID");
  const source = JSON.stringify([
    "b2b-return-event-v1", input.tenantId, input.phase,
    input.eventId.toLowerCase(), input.returnLineId, input.itemId,
    ...input.quantities,
  ]);
  return {
    eventId: input.eventId.toLowerCase(),
    payloadHash: createHash("sha256").update(source).digest("hex"),
  };
}
export { eventScope as fingerprintReturnEvent };

function stockAmount(label: string, n: number): void {
  if (!Number.isSafeInteger(n) || n < 0 || n > RETURN_INT_MAX) {
    throw new ReturnEventPlanError(label + "が在庫整数の範囲外です");
  }
}
export function planBuyerReturnDispatch(input: {
  eventId: string;
  tenantId: string;
  returnLineId: string;
  buyerItemId: string;
  approved: number;
  alreadyDispatched: number;
  dispatch: number;
  currentBuyerStock: number;
}) {
  checkId(input.buyerItemId, "買い手商品ID");
  const change = validateB2BReturnDispatch(input);
  const key = eventScope({
    ...input, itemId: input.buyerItemId, phase: "DISPATCH",
    quantities: [input.dispatch],
  });
  return {
    ...key, phase: "DISPATCH" as const,
    tenantId: input.tenantId,
    returnLineId: input.returnLineId,
    itemId: input.buyerItemId,
    movementType: "OUTBOUND" as const,
    quantity: input.dispatch,
    newStock: change.newBuyerStock,
    remainingApproved: change.remainingApproved,
  };
}

export function planSellerReturnInspection(input: {
  eventId: string;
  tenantId: string;
  returnLineId: string;
  sellerItemId: string;
  dispatched: number;
  alreadyInspected: number;
  receivedNow: number;
  saleable: number;
  unsaleable: number;
  currentSellerStock: number;
}) {
  checkId(input.sellerItemId, "売り手商品ID");
  stockAmount("売り手現在庫", input.currentSellerStock);
  const inspection = validateB2BReturnInspection(input);
  const newStock = input.currentSellerStock + inspection.sellerRestock;
  stockAmount("検品後在庫", newStock);
  const key = eventScope({
    ...input, itemId: input.sellerItemId, phase: "INSPECTION",
    quantities: [input.receivedNow, input.saleable, input.unsaleable],
  });
  return {
    ...key, phase: "INSPECTION" as const,
    tenantId: input.tenantId,
    returnLineId: input.returnLineId,
    itemId: input.sellerItemId,
    movementType: inspection.sellerRestock > 0 ? "INBOUND" as const : null,
    quantity: inspection.sellerRestock,
    quarantine: inspection.quarantine,
    newStock,
    remainingInTransit: inspection.remainingInTransit,
  };
}
