/**
 * Read-only CreditNote draft eligibility planner (no tax, invoice or refund writes).
 * A "READY" result only allows a DRAFT proposal after server-side source locking.
 * It NEVER authorizes issuing, applying, offsetting or refunding money.
 */
export type CreditDraftBlocker =
  | "INVALID_QUANTITIES" | "RETURN_NOT_INSPECTED"
  | "SOURCE_ORDER_NOT_LINKED" | "ORIGINAL_INVOICE_NOT_FOUND"
  | "ORIGINAL_INVOICE_NOT_ISSUED" | "ORIGINAL_INVOICE_WRONG_SELLER"
  | "ORIGINAL_INVOICE_WRONG_ORDER" | "ALREADY_FULLY_ALLOCATED";
export type DraftEligibility = {
  canPrepareDraft: boolean;
  remainingInspectedUnits: number;
  blocker: CreditDraftBlocker | null;
};
export function assessCreditDraftReadiness(input: {
  returnStatus: string;
  approved: number;
  inspected: number;
  alreadyAllocated: number;
  sellerOrderId: string | null;
  sellerTenantId: string;
  originalInvoice: null | {
    status: string;
    tenantId: string;
    orderIds: readonly string[];
  };
}): DraftEligibility {
  const blocked=(blocker:CreditDraftBlocker):DraftEligibility=>({
    canPrepareDraft:false,remainingInspectedUnits:0,blocker,
  });
  const { approved,inspected,alreadyAllocated }=input;
  if (![approved,inspected,alreadyAllocated].every(n =>
        Number.isSafeInteger(n) && n >= 0 && n <= 2_147_483_647) ||
      inspected > approved || alreadyAllocated > inspected) {
    return blocked("INVALID_QUANTITIES");
  }
  if (input.returnStatus !== "INSPECTED" || approved===0 || inspected===0) {
    return blocked("RETURN_NOT_INSPECTED");
  }
  if (!input.sellerOrderId) return blocked("SOURCE_ORDER_NOT_LINKED");
  if (!input.originalInvoice) return blocked("ORIGINAL_INVOICE_NOT_FOUND");
  const invoice=input.originalInvoice;
  if (invoice.tenantId !== input.sellerTenantId) return blocked("ORIGINAL_INVOICE_WRONG_SELLER");
  if (invoice.status !== "ISSUED" && invoice.status !== "PAID") {
    return blocked("ORIGINAL_INVOICE_NOT_ISSUED");
  }
  if (!invoice.orderIds.includes(input.sellerOrderId)) {
    return blocked("ORIGINAL_INVOICE_WRONG_ORDER");
  }
  if (alreadyAllocated===inspected) return blocked("ALREADY_FULLY_ALLOCATED");
  return {canPrepareDraft:true,remainingInspectedUnits:inspected-alreadyAllocated,blocker:null};
}
