import { describe, expect, it } from "vitest";
import { validateB2BCreditDraftAmounts } from "./b2b-credit-draft-amounts";

const baseline = {
  currencyCode: "JPY",
  originalInvoice: {
    status: "ISSUED" as const,
    subtotal: 1500, tax: 150, total: 1650,
    taxRate: 10, taxPerOrder: false,
  },
  priorCreditAmounts: { subtotal: 200, tax: 20, total: 220 },
  taxAllocationExplanation: "請求書全体の税込/税抜と元受注の計算単位を照合した",
  lines: [{
    returnLineId: "line-1", alreadyInspectedUnallocated: 3,
    creditedQuantity: 2, subtotal: 300, tax: 30, total: 330,
  }],
};

describe("B2B credit note DRAFT amount validation (no issuance/refund)", () => {
  it("accepts bounded human-proposed amounts but never returns an issued credit", () => {
    const r = validateB2BCreditDraftAmounts(baseline);
    expect(r).toEqual({
      status: "MANUAL_ACCOUNTING_REVIEW_REQUIRED",
      proposed: { subtotal: 300, tax: 30, total: 330 },
      remainingInvoiceCapacity: {
        subtotal: 1000, tax: 100, total: 1100,
      },
      taxPerOrder: false,
      message: expect.stringContaining("発行・返金は禁止"),
    });
    expect(r).not.toHaveProperty("issuedAt");
    expect(r).not.toHaveProperty("refundId");
  });
  it("supports per-order tax mode but does not calculate tax automatically", () => {
    expect(validateB2BCreditDraftAmounts({
      ...baseline,
      originalInvoice: {
        ...baseline.originalInvoice, taxPerOrder: true, status: "PAID",
      },
    }).taxPerOrder).toBe(true);
  });
  it("blocks unissued/cancelled source invoices and invalid currency or accounting basis", () => {
    for (const status of ["DRAFT", "CANCELLED"] as const) {
      expect(() => validateB2BCreditDraftAmounts({
        ...baseline, originalInvoice: { ...baseline.originalInvoice, status },
      })).toThrow("未発行");
    }
    expect(() => validateB2BCreditDraftAmounts({
      ...baseline, currencyCode: "jp",
    })).toThrow("通貨コード");
    expect(() => validateB2BCreditDraftAmounts({
      ...baseline, originalInvoice: {
        ...baseline.originalInvoice, taxRate: 150,
      },
    })).toThrow("税率");
  });
  it("rejects duplicate return lines, uninspected quantity, over-credit and bad tax", () => {
    expect(() => validateB2BCreditDraftAmounts({
      ...baseline, lines: [baseline.lines[0], baseline.lines[0]],
    })).toThrow("重複");
    expect(() => validateB2BCreditDraftAmounts({
      ...baseline, lines: [{ ...baseline.lines[0], creditedQuantity: 4 }],
    })).toThrow("実検品");
    expect(() => validateB2BCreditDraftAmounts({
      ...baseline, lines: [{ ...baseline.lines[0], tax: 31 }],
    })).toThrow("一致");
    expect(() => validateB2BCreditDraftAmounts({
      ...baseline, lines: [{ ...baseline.lines[0], total: -1 }],
    })).toThrow();
    expect(() => validateB2BCreditDraftAmounts({
      ...baseline, priorCreditAmounts: {
        subtotal: 1300, tax: 130, total: 1430,
      },
    })).toThrow("元請求書");
  });
  it("requires explicit tax allocation justification and nonzero credit", () => {
    expect(() => validateB2BCreditDraftAmounts({
      ...baseline, taxAllocationExplanation: " ",
    })).toThrow("根拠");
    expect(() => validateB2BCreditDraftAmounts({
      ...baseline, lines: [{ ...baseline.lines[0], subtotal: 0, tax: 0, total: 0 }],
    })).toThrow("0金額");
  });
  it("rejects numeric overflow, fractional amounts and invalid invoice totals", () => {
    expect(() => validateB2BCreditDraftAmounts({
      ...baseline, originalInvoice: {
        ...baseline.originalInvoice, total: 1651,
      },
    })).toThrow("一致");
    expect(() => validateB2BCreditDraftAmounts({
      ...baseline, lines: [{ ...baseline.lines[0], subtotal: 1.5, total: 31.5 }],
    })).toThrow("整数");
    expect(() => validateB2BCreditDraftAmounts({
      ...baseline, lines: [{ ...baseline.lines[0], subtotal: 2147483648, tax: 0, total: 2147483648 }],
    })).toThrow();
  });
});
