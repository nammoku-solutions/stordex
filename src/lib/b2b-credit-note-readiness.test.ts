import { describe, expect, it } from "vitest";
import { assessB2BCreditNoteReadiness } from "./b2b-credit-note-readiness";

const counts = {
  approved: 7, dispatched: 5, inspected: 4,
  previouslyCreditedUnits: 1,
};
describe("credit note requires source invoice reconciliation", () => {
  it("does not authorize credits or refunds before physical inspection", () => {
    const r = assessB2BCreditNoteReadiness({
      ...counts, inspected: 0, previouslyCreditedUnits: 0,
      linkedInvoices: [],
    });
    expect(r.status).toBe("AWAITING_INSPECTION");
    expect(r.inspectedUncreditedUnits).toBe(0);
  });
  it("keeps unbilled orders separate from invoice-based credit notes", () => {
    const r = assessB2BCreditNoteReadiness({
      ...counts, linkedInvoices: [],
    });
    expect(r.status).toBe("NO_LINKED_INVOICE");
    expect(r.inspectedUncreditedUnits).toBe(3);
    expect(r.paymentReviewRequired).toBe(false);
  });
  it("requires original tax mode and payment review for paid invoices", () => {
    const r = assessB2BCreditNoteReadiness({
      ...counts,
      linkedInvoices: [
        { id: "inv-2", status: "PAID", taxPerOrder: false, taxRate: 10 },
        { id: "inv-1", status: "ISSUED", taxPerOrder: true, taxRate: 8 },
      ],
    });
    expect(r).toMatchObject({
      status: "MANUAL_RECONCILIATION_REQUIRED",
      inspectedUncreditedUnits: 3,
      invoiceIds: ["inv-1", "inv-2"],
      taxBasis: "MIXED_OR_INVOICE_SPECIFIC",
      paymentReviewRequired: true,
    });
    expect(r).not.toHaveProperty("creditAmount");
    expect(r).not.toHaveProperty("refundAmount");
  });
  it("does not authorize another credit if all inspected units have been credited", () => {
    const r = assessB2BCreditNoteReadiness({
      ...counts, previouslyCreditedUnits: 4,
      linkedInvoices: [{
        id: "inv-1", status: "PAID", taxPerOrder: true, taxRate: 10,
      }],
    });
    expect(r.status).toBe("NO_UNCREDITED_UNITS");
  });
  it("fails on quantity contradictions, duplicate invoice links or invalid tax", () => {
    for(const altered of [
      {approved:3}, {dispatched:8}, {inspected:6},
      {previouslyCreditedUnits:5}, {approved:-1},
      {inspected:1.5}, {approved:2147483648},
    ]) {
      expect(() => assessB2BCreditNoteReadiness({
        ...counts, ...altered, linkedInvoices: [],
      })).toThrow();
    }
    const invoiced = { id:"inv-1", status:"ISSUED" as const,
      taxPerOrder:true, taxRate:10 };
    expect(() => assessB2BCreditNoteReadiness({
      ...counts, linkedInvoices:[invoiced,invoiced],
    })).toThrow("元請求書");
    expect(() => assessB2BCreditNoteReadiness({
      ...counts, linkedInvoices:[{...invoiced,taxRate:105}],
    })).toThrow("元請求書");
  });
});
