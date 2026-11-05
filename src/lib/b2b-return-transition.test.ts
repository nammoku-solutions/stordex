import { describe, expect, it } from "vitest";
import { assessB2BReturnStatusTransition } from "./b2b-return-transition";

type Input = Parameters<typeof assessB2BReturnStatusTransition>[0];
const line = {
  id: "ret-line-a", requested: 5, approved: 3, dispatched: 0,
  inspected: 0, draftCreditAllocated: 0,
};
const base: Input = {
  currentStatus: "PARTIALLY_APPROVED", targetStatus: "DISPATCHED",
  actorSide: "BUYER", actorRole: "OWNER",
  lines: [{...line, dispatched: 2}],
  financialResolution: "NOT_REVIEWED", settlementLedgerVerified: false,
  closeReason: null,
};
function check(change: Partial<Input>) {
  return assessB2BReturnStatusTransition({...base, ...change});
}

describe("B2B return status transition plan; no DB writes", () => {
  it("allows a buyer dispatch only after physical dispatch evidence", () => {
    expect(check({}).status).toBe("TRANSITION_CHECKS_PASSED_NOT_SAVED");
    expect(() => check({lines:[line]})).toThrow("実返送");
    expect(() => check({actorSide:"SELLER"})).toThrow("買い手・売り手");
    expect(() => check({actorRole:"STAFF"})).toThrow("管理者");
  });
  it("validates provisional seller partial/total approval and no premature update", () => {
    expect(check({
      currentStatus: "UNDER_REVIEW", targetStatus: "PARTIALLY_APPROVED",
      actorSide:"SELLER", lines:[line],
    }).to).toBe("PARTIALLY_APPROVED");
    expect(check({
      currentStatus:"UNDER_REVIEW", targetStatus:"APPROVED",
      actorSide:"SELLER", lines:[{...line, approved:5}],
    }).to).toBe("APPROVED");
    expect(() => check({
      currentStatus:"UNDER_REVIEW", targetStatus:"APPROVED",
      actorSide:"SELLER", lines:[line],
    })).toThrow("承認数量");
    expect(check({
      currentStatus:"SUBMITTED", targetStatus:"UNDER_REVIEW",
      actorSide:"SELLER", lines:[{...line, approved:0}],
    }).to).toBe("UNDER_REVIEW");
  });
  it("tracks partial and full inspection and requires physical completion", () => {
    expect(check({
      currentStatus: "DISPATCHED", targetStatus: "PARTIALLY_INSPECTED",
      actorSide: "SELLER", lines:[{...line, dispatched:2, inspected:1}],
    }).to).toBe("PARTIALLY_INSPECTED");
    expect(check({
      currentStatus: "DISPATCHED", targetStatus: "INSPECTED",
      actorSide: "SELLER", lines:[{...line, dispatched:3, inspected:3}],
    }).to).toBe("INSPECTED");
    expect(() => check({
      currentStatus: "PARTIALLY_INSPECTED", targetStatus: "INSPECTED",
      actorSide: "SELLER", lines:[{...line, dispatched:3, inspected:2}],
    })).toThrow("すべて");
    expect(check({
      currentStatus: "INSPECTED", targetStatus: "CREDIT_PENDING",
      actorSide: "SELLER", lines:[{...line, dispatched:3, inspected:3}],
    }).to).toBe("CREDIT_PENDING");
  });
  it("never closes without independently reconciled financial evidence", () => {
    const closed: Partial<Input> = {
      currentStatus: "CREDIT_PENDING", targetStatus: "CLOSED",
      actorSide: "SELLER", lines:[{...line, dispatched:3, inspected:3}],
      closeReason: "返金台帳・残高の照合が完了",
    };
    expect(() => check(closed)).toThrow("独立監査");
    expect(() => check({
      ...closed, settlementLedgerVerified: true,
    })).toThrow("独立監査");
    expect(check({
      ...closed, settlementLedgerVerified: true,
      financialResolution: "SETTLED_AND_RECONCILED",
    }).status).toBe("TRANSITION_CHECKS_PASSED_NOT_SAVED");
    expect(check({
      ...closed, settlementLedgerVerified: true,
      financialResolution: "NO_CREDIT_DUE_AUDITED",
    }).to).toBe("CLOSED");
    expect(() => check({
      ...closed, settlementLedgerVerified: true,
      financialResolution: "SETTLED_AND_RECONCILED",
      closeReason: " ",
    })).toThrow("完了理由");
  });
  it("rejects skipped steps, no-op, terminal states and missing proof", () => {
    for(const changed of [
      {targetStatus:"CLOSED" as const},
      {targetStatus:"PARTIALLY_APPROVED" as const},
      {targetStatus:"PARTIALLY_INSPECTED" as const},
      {targetStatus:"PARTIALLY_APPROVED" as const,
       currentStatus:"PARTIALLY_APPROVED" as const},
    ]) {
      expect(() => check(changed)).toThrow("飛び越し");
    }
    expect(() => check({
      currentStatus: "CLOSED", targetStatus:"DISPATCHED",
    })).toThrow("飛び越し");
    expect(() => check({
      currentStatus:"APPROVED", targetStatus:"DISPATCHED",
    })).toThrow("現行");
    expect(check({
      currentStatus:"SUBMITTED", targetStatus:"REJECTED",
      actorSide:"SELLER", lines:[{...line,approved:0}],
    }).to).toBe("REJECTED");
    expect(() => check({
      currentStatus:"SUBMITTED", targetStatus:"WITHDRAWN",
      actorSide:"BUYER", lines:[{...line,approved:0}],
    })).not.toThrow();
  });
});
