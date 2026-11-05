import { describe, expect, it } from "vitest";
import { assessB2BReturnProgress, assessB2BFinancialNextStep } from "./b2b-return-progress";

const source = {
  id: "ret-line-1", requested: 5, approved: 4,
  dispatched: 0, inspected: 0, draftCreditAllocated: 0,
};
const assess = (overrides: Partial<typeof source> = {},
  status: Parameters<typeof assessB2BReturnProgress>[0]["status"] = "PARTIALLY_APPROVED") =>
  assessB2BReturnProgress({ status, lines: [{ ...source, ...overrides }] });

describe("B2B read-only return progress (not a status writer)", () => {
  it("does not assume pre-approval or rejected returns have shipped", () => {
    expect(assess({ approved: 0 }, "SUBMITTED").phase).toBe("WAITING_REVIEW");
    expect(assess({ approved: 0 }, "UNDER_REVIEW").phase).toBe("WAITING_REVIEW");
    expect(assess({ approved: 0 }, "REJECTED").phase).toBe("REJECTED");
    expect(assess({ approved: 0 }, "WITHDRAWN").phase).toBe("WITHDRAWN");
    expect(() => assess({}, "REJECTED")).toThrow("一致しません");
    expect(() => assess({ dispatched: 1 }, "SUBMITTED")).toThrow();
  });

  it("distinguishes ready, partial shipment, partial inspection and physical completion", () => {
    expect(assess().phase).toBe("AWAITING_DISPATCH");
    const dispatched = assess({ dispatched: 2 });
    expect(dispatched.phase).toBe("IN_TRANSIT");
    expect(dispatched.summary.notYetDispatched).toBe(2);
    expect(dispatched.summary.inTransit).toBe(2);
    expect(assess({ dispatched: 3, inspected: 1 }).phase).toBe("PARTIALLY_INSPECTED");
    expect(assess({ dispatched: 2, inspected: 2 }).phase).toBe("PARTIALLY_RETURNED");
    expect(assess({ dispatched: 4, inspected: 4 }).phase)
      .toBe("AWAITING_CREDIT_REVIEW");
  });

  it("a draft allocation is not a posted credit; computes unallocated inspected units", () => {
    const r = assess({ dispatched: 4, inspected: 4, draftCreditAllocated: 3 });
    expect(r.summary).toEqual({
      requested: 5, approved: 4, dispatched: 4, inspected: 4,
      draftCreditAllocated: 3, notYetDispatched: 0, inTransit: 0,
      inspectedUnallocated: 1,
    });
    expect(r.canConsiderCreditDraft).toBe(true);
    expect(r.warning).toContain("発行・返金はされません");
    const allocated = assess({
      dispatched: 4, inspected: 4, draftCreditAllocated: 4,
    });
    expect(allocated.canConsiderCreditDraft).toBe(false);
  });

  it("rejects impossible quantities, duplicate lines, unsupported statuses and premature closure", () => {
    for (const changed of [
      { approved: 6 }, { dispatched: 5 }, { inspected: 1 },
      { draftCreditAllocated: 1 }, { requested: -1 }, { approved: 1.5 },
      { requested: 2147483648 },
    ]) {
      expect(() => assess(changed)).toThrow();
    }
    expect(() => assess({ dispatched: 4, inspected: 3 }, "CLOSED"))
      .toThrow("完了");
    expect(() => assessB2BReturnProgress({
      status: "APPROVED", lines: [source, source],
    })).toThrow("重複");
    expect(() => assessB2BReturnProgress({
      status: "APPROVED", lines: [],
    })).toThrow("1〜100");
    expect(() => assess({ approved: 0 }, "APPROVED")).toThrow("承認数量");
    expect(() => assess({}, "GHOST" as "APPROVED")).toThrow("ステータス");
  });

  it("sums multiple lines without mixing pending stock and allocated drafts", () => {
    const r = assessB2BReturnProgress({
      status: "APPROVED",
      lines: [
        { ...source, id: "a", approved: 3, dispatched: 3, inspected: 3, draftCreditAllocated: 1 },
        { ...source, id: "b", approved: 2, dispatched: 1, inspected: 0 },
      ],
    });
    expect(r.summary.approved).toBe(5);
    expect(r.summary.dispatched).toBe(4);
    expect(r.summary.inTransit).toBe(1);
    expect(r.summary.inspectedUnallocated).toBe(2);
  });

  it("never chooses a refund or invoice offset from invoice status alone", () => {
    const check = (invoiceStatus: "NONE" | "DRAFT" | "ISSUED" | "PAID" | "CANCELLED",
      creditStatus: "NONE" | "DRAFT" | "RECONCILED" | "ISSUED" | "APPLIED" | "VOID" = "DRAFT") =>
      assessB2BFinancialNextStep({ hasInspectedUnallocatedUnits: true,
        invoiceStatus, creditStatus });
    expect(check("NONE").next).toBe("RECONCILE_SOURCE_INVOICE");
    expect(check("CANCELLED").next).toBe("RECONCILE_SOURCE_INVOICE");
    expect(check("PAID").next).toBe("RECONCILE_SOURCE_INVOICE");
    expect(check("ISSUED", "ISSUED").next).toBe("REVIEW_SETTLEMENT_METHOD");
    expect(check("PAID", "ISSUED").message).toContain("別の取引");
    expect(assessB2BFinancialNextStep({
      hasInspectedUnallocatedUnits: false, invoiceStatus: "PAID",
    }).next).toBe("NO_CREDIT_REVIEW");
  });
});
