import { describe, expect, it } from "vitest";
import { assessB2BReturnReview } from "./b2b-return-review";

const lines = [
  { sourceLineId: "line-1", requestedQuantity: 7, approvedQuantity: 7 },
  { sourceLineId: "line-2", requestedQuantity: 4, approvedQuantity: 4 },
];

describe("B2B return seller review (pure, not an authorization)", () => {
  it("classifies full approval without requiring a note", () => {
    expect(assessB2BReturnReview({
      currentStatus: "SUBMITTED", lines,
    })).toEqual({
      status: "APPROVED", totalRequested: 11, totalApproved: 11,
      rejectedLineCount: 0, reviewNote: null,
    });
  });

  it("classifies partial approval, preserves quantities and requires an explanation", () => {
    expect(assessB2BReturnReview({
      currentStatus: "UNDER_REVIEW",
      lines: [lines[0], { ...lines[1], approvedQuantity: 1 }],
      reviewNote: "  破損状況を確認し1個のみ承認  ",
    })).toEqual({
      status: "PARTIALLY_APPROVED", totalRequested: 11,
      totalApproved: 8, rejectedLineCount: 1,
      reviewNote: "破損状況を確認し1個のみ承認",
    });
    expect(() => assessB2BReturnReview({
      currentStatus: "SUBMITTED",
      lines: [lines[0], { ...lines[1], approvedQuantity: 1 }],
    })).toThrow("理由");
  });

  it("classifies complete rejection and requires an explanation", () => {
    expect(assessB2BReturnReview({
      currentStatus: "SUBMITTED",
      lines: lines.map(line => ({ ...line, approvedQuantity: 0 })),
      reviewNote: "返品対象外",
    }).status).toBe("REJECTED");
    expect(() => assessB2BReturnReview({
      currentStatus: "SUBMITTED",
      lines: lines.map(line => ({ ...line, approvedQuantity: 0 })),
    })).toThrow("理由");
  });

  it("blocks repeated review, terminal and dispatched states", () => {
    for (const currentStatus of [
      "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "WITHDRAWN",
      "DISPATCHED", "INSPECTED", "CREDIT_PENDING", "CLOSED", "UNKNOWN",
    ]) {
      expect(() => assessB2BReturnReview({ currentStatus, lines })).toThrow(
        "処理済み",
      );
    }
  });

  it("rejects duplicate IDs and invalid, non-integer, negative or oversized quantities", () => {
    for (const altered of [
      { sourceLineId: "", requestedQuantity: 2, approvedQuantity: 1 },
      { sourceLineId: "line-1", requestedQuantity: 4, approvedQuantity: 1 },
      { sourceLineId: "x", requestedQuantity: 0, approvedQuantity: 0 },
      { sourceLineId: "x", requestedQuantity: 2, approvedQuantity: 3 },
      { sourceLineId: "x", requestedQuantity: 2, approvedQuantity: -1 },
      { sourceLineId: "x", requestedQuantity: 2, approvedQuantity: 1.5 },
      { sourceLineId: "x", requestedQuantity: 2147483648, approvedQuantity: 1 },
      { sourceLineId: "x", requestedQuantity: Number.NaN, approvedQuantity: 1 },
    ]) {
      expect(() => assessB2BReturnReview({
        currentStatus: "SUBMITTED", lines: [lines[0], altered],
        reviewNote: "確認",
      })).toThrow();
    }
    expect(() => assessB2BReturnReview({
      currentStatus: "SUBMITTED", lines: [], reviewNote: "確認",
    })).toThrow("返品明細");
    expect(() => assessB2BReturnReview({
      currentStatus: "SUBMITTED", lines,
      reviewNote: "x".repeat(501),
    })).toThrow("500文字");
  });

  it("retains exact large totals within the bounded 100-line review limit", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      sourceLineId: "line-" + i,
      requestedQuantity: 2147483647,
      approvedQuantity: 2147483647,
    }));
    expect(assessB2BReturnReview({
      currentStatus: "SUBMITTED", lines: many,
    }).totalRequested).toBe(10737418235);
    expect(() => assessB2BReturnReview({
      currentStatus: "SUBMITTED",
      lines: Array.from({ length: 101 }, (_, i) => ({
        sourceLineId: "line-" + i, requestedQuantity: 1, approvedQuantity: 1,
      })),
    })).toThrow("上限");
  });
});
