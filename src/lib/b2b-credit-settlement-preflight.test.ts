import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { planB2BCreditSettlement } from "./b2b-credit-settlement-preflight";

const base = {
  sellerTenantId: "seller-1",
  creditNoteId: "credit-1",
  targetReferenceId: "receipt-1",
  idempotencyKey: randomUUID(),
  currencyCode: "JPY",
  method: "REFUND" as const,
  creditStatus: "ISSUED" as const,
  originalInvoiceStatus: "PAID" as const,
  issuedCreditTotalMinor: 1000,
  previouslySettledMinor: 200,
  requestedMinor: 300,
  eligiblePaidAmountMinor: 500,
  eligibleOpenReceivableMinor: 100,
  sourceInvoiceAndTenantVerified: true,
  originalTaxAllocationReviewed: true,
  currencyMinorUnitVerified: true,
  paymentOrReceivableLedgerReconciled: true,
};

describe("B2B CreditNote settlement method preflight (no payment)", () => {
  it("plans only manual review, not a refund event or invoice write", () => {
    const planned = planB2BCreditSettlement(base);
    expect(planned).toMatchObject({
      status: "MANUAL_SETTLEMENT_REVIEW_REQUIRED",
      method: "REFUND",
      requestedMinor: 300, remainingCreditMinor: 500,
    });
    expect(planned.message).toContain("別途承認");
    expect(planned).not.toHaveProperty("paymentId");
    expect(planned).not.toHaveProperty("appliedAt");
  });

  it("separates refunds from invoice offsets and requires different balance evidence", () => {
    expect(() => planB2BCreditSettlement({
      ...base, method: "INVOICE_OFFSET",
    })).toThrow("未回収請求残高");
    const offset = planB2BCreditSettlement({
      ...base, method: "INVOICE_OFFSET", originalInvoiceStatus: "ISSUED",
      eligiblePaidAmountMinor: 0, eligibleOpenReceivableMinor: 350,
      targetReferenceId: "receivable-invoice-1",
    });
    expect(offset.method).toBe("INVOICE_OFFSET");
    expect(offset.remainingCreditMinor).toBe(500);
    expect(offset.claimKey).toBe(planB2BCreditSettlement({
      ...base, method: "INVOICE_OFFSET", originalInvoiceStatus: "ISSUED",
      eligiblePaidAmountMinor: 0, eligibleOpenReceivableMinor: 350,
      targetReferenceId: "receivable-invoice-1",
    }).claimKey);
    expect(offset.payloadHash).not.toBe(planB2BCreditSettlement(base).payloadHash);
  });

  it("rejects drafts, voids, already applied credits and nonissued source invoices", () => {
    for(const creditStatus of ["DRAFT", "RECONCILED", "APPLIED", "VOID"] as const) {
      expect(() => planB2BCreditSettlement({ ...base, creditStatus }))
        .toThrow("正式発行済み");
    }
    for(const originalInvoiceStatus of ["DRAFT", "CANCELLED"] as const) {
      expect(() => planB2BCreditSettlement({ ...base, originalInvoiceStatus }))
        .toThrow("正式発行済み");
    }
    expect(() => planB2BCreditSettlement({
      ...base, originalInvoiceStatus: "ISSUED",
    })).toThrow("入金済み");
  });

  it("rejects missing accounting verification and unsafe identifiers", () => {
    for(const flag of [
      "sourceInvoiceAndTenantVerified",
      "originalTaxAllocationReviewed",
      "currencyMinorUnitVerified",
      "paymentOrReceivableLedgerReconciled",
    ] as const) {
      expect(() => planB2BCreditSettlement({ ...base, [flag]: false }))
        .toThrow("照合");
    }
    expect(() => planB2BCreditSettlement({
      ...base, targetReferenceId: "../elsewhere",
    })).toThrow("参照先");
    expect(() => planB2BCreditSettlement({
      ...base, idempotencyKey: "not-a-uuid",
    })).toThrow("再送");
    expect(() => planB2BCreditSettlement({
      ...base, currencyCode: "JPY/other",
    })).toThrow("通貨");
  });

  it("rejects over-refund, over-offset, negative, fractional and integer-overflow sums", () => {
    expect(() => planB2BCreditSettlement({
      ...base, requestedMinor: 600,
    })).toThrow("返金可能残高");
    expect(() => planB2BCreditSettlement({
      ...base, requestedMinor: 801,
      eligiblePaidAmountMinor: 1000,
    })).toThrow("CreditNote残高");
    expect(() => planB2BCreditSettlement({
      ...base, previouslySettledMinor: 1100,
    })).toThrow("CreditNote残高");
    for(const amount of [-1, 0.5, 2147483648, Number.NaN]) {
      expect(() => planB2BCreditSettlement({
        ...base, eligiblePaidAmountMinor: amount,
      })).toThrow("整数");
    }
    expect(() => planB2BCreditSettlement({
      ...base, requestedMinor: 0,
    })).toThrow("CreditNote残高");
  });

  it("uses a stable claim key for same event but fingerprints changed payload", () => {
    const one = planB2BCreditSettlement(base);
    const changed = planB2BCreditSettlement({
      ...base, requestedMinor: 250,
    });
    expect(one.claimKey).toBe(changed.claimKey);
    expect(one.payloadHash).not.toBe(changed.payloadHash);
    expect(one.claimKey).toMatch(/^[a-f0-9]{64}$/);
    expect(one.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(one.claimKey).not.toBe(planB2BCreditSettlement({
      ...base, idempotencyKey: randomUUID(),
    }).claimKey);
  });
});
