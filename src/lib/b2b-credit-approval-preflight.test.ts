import { describe, expect, it } from "vitest";
import { assessB2BCreditApprovalPreflight } from "./b2b-credit-approval-preflight";

const source = {
  sellerTenantId: "seller-a", invoiceTenantId: "seller-a",
  reviewerTenantId: "seller-a",
  authorUserId: "author-1", reviewerUserId: "reviewer-2",
  reviewerRole: "ADMIN" as const,
  invoiceStatus: "ISSUED" as const, creditStatus: "DRAFT" as const,
  currencyCode: "JPY",
  originalInvoice: { subtotal: 1000, tax: 100, total: 1100 },
  creditProposal: { subtotal: 200, tax: 20, total: 220 },
  otherActiveCredits: { subtotal: 100, tax: 10, total: 110 },
  lines: [{sourceReturnLineId: "line-a", creditedUnits: 2,
    physicallyInspectedUnits: 3, otherReservedUnits: 1,
    subtotal: 200, tax: 20, total: 220}],
  taxAllocationExplanation: "元の請求書と伝票単位の端数を照合済み",
  reviewNote: "第三者による金額・納品・税額根拠の独立レビュー",
  evidence: {
    invoiceContainsSellerOrder: true,
    sourceInvoiceSnapshotMatches: true,
    taxBasisAndRoundingReviewed: true,
    currencyMinorUnitsReviewed: true,
    priorCreditsAndPaymentsReconciled: true,
  },
};

describe("CreditNote manual approval preflight (no issue, no refund)", () => {
  it("reports checks passed only, keeps invoice headroom", () => {
    const res = assessB2BCreditApprovalPreflight(source);
    expect(res).toMatchObject({
      status: "CHECKS_PASSED_NOT_APPROVED",
      reviewedLineCount: 1,
      proposed: {subtotal: 200, tax: 20, total: 220},
      remainingInvoiceCapacity: {subtotal: 700, tax: 70, total: 770},
    });
    expect(res).not.toHaveProperty("approvedAt");
    expect(res).not.toHaveProperty("issuedAt");
    expect(res).not.toHaveProperty("paymentId");
    expect(res.message).toContain("実施されていません");
  });
  it("requires a separate active seller manager in the same tenant", () => {
    for (const altered of [
      { reviewerUserId: "author-1" },
      { reviewerRole: "STAFF" as const },
      { reviewerTenantId: "another-company" },
      { invoiceTenantId: "another-company" },
    ]) {
      expect(() => assessB2BCreditApprovalPreflight({...source, ...altered}))
        .toThrow();
    }
  });
  it("accepts only DRAFT credit and already issued or paid source invoice", () => {
    for (const status of ["RECONCILED", "ISSUED", "APPLIED", "VOID"] as const) {
      expect(() => assessB2BCreditApprovalPreflight({
        ...source, creditStatus: status,
      })).toThrow("下書き");
    }
    for (const status of ["DRAFT", "CANCELLED"] as const) {
      expect(() => assessB2BCreditApprovalPreflight({
        ...source, invoiceStatus: status,
      })).toThrow("元請求書");
    }
    expect(assessB2BCreditApprovalPreflight({
      ...source, invoiceStatus: "PAID",
    }).status).toBe("CHECKS_PASSED_NOT_APPROVED");
  });
  it("fails when any independent financial evidence is absent", () => {
    for (const key of Object.keys(source.evidence) as
      (keyof typeof source.evidence)[]) {
      expect(() => assessB2BCreditApprovalPreflight({
        ...source, evidence: {...source.evidence, [key]: false},
      })).toThrow("照合が未完了");
    }
    expect(() => assessB2BCreditApprovalPreflight({
      ...source, taxAllocationExplanation: " ",
    })).toThrow("根拠");
    expect(() => assessB2BCreditApprovalPreflight({
      ...source, reviewNote: " ",
    })).toThrow("独立審査");
  });
  it("rejects credit beyond inspected capacity when this draft is excluded", () => {
    expect(() => assessB2BCreditApprovalPreflight({
      ...source, lines: [{...source.lines[0], otherReservedUnits: 2}],
    })).toThrow("検品済み");
    expect(() => assessB2BCreditApprovalPreflight({
      ...source, lines: [source.lines[0], source.lines[0]],
    })).toThrow("重複");
    expect(() => assessB2BCreditApprovalPreflight({
      ...source, lines: [{...source.lines[0], creditedUnits: 0}],
    })).toThrow("検品済み");
  });
  it("rejects invoice overspend, mismatched line totals and malformed tax", () => {
    expect(() => assessB2BCreditApprovalPreflight({
      ...source, otherActiveCredits: {subtotal: 900, tax: 90, total: 990},
    })).toThrow("超えています");
    expect(() => assessB2BCreditApprovalPreflight({
      ...source, creditProposal: {subtotal: 200, tax: 20, total: 221},
    })).toThrow("一致しません");
    expect(() => assessB2BCreditApprovalPreflight({
      ...source, lines: [{...source.lines[0], tax: 19, total: 219}],
    })).toThrow("明細の合計");
    expect(() => assessB2BCreditApprovalPreflight({
      ...source, currencyCode: "../",
    })).toThrow("通貨");
    expect(() => assessB2BCreditApprovalPreflight({
      ...source, creditProposal: {subtotal: 2147483648, tax: 0, total: 2147483648},
    })).toThrow("整数");
  });
});
