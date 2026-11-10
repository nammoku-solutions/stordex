import { describe, expect, it } from "vitest";
import { suggestReturnStatusReconciliation as plan } from "./b2b-return-status-reconcile-plan";

const done=[{approved:2,dispatched:2,inspected:2}];
describe("read-only physical return status suggestions", () => {
  it("reconciles the completed 2-box historical UAT in buyer-then-seller order", () => {
    expect(plan({status:"PARTIALLY_APPROVED",actorSide:"BUYER",lines:done}))
      .toBe("DISPATCHED");
    expect(plan({status:"DISPATCHED",actorSide:"SELLER",lines:done}))
      .toBe("INSPECTED");
    expect(plan({status:"INSPECTED",actorSide:"SELLER",lines:done}))
      .toBeNull();
  });
  it("does not skip buyer dispatch or unrecorded inspection", () => {
    expect(plan({status:"PARTIALLY_APPROVED",actorSide:"SELLER",lines:done}))
      .toBeNull();
    expect(plan({status:"DISPATCHED",actorSide:"BUYER",lines:done}))
      .toBeNull();
    expect(plan({status:"PARTIALLY_APPROVED",actorSide:"BUYER",
      lines:[{approved:2,dispatched:0,inspected:0}]})).toBeNull();
    expect(plan({status:"DISPATCHED",actorSide:"SELLER",
      lines:[{approved:2,dispatched:2,inspected:0}]})).toBeNull();
  });
  it("offers partial inspection only when real inspected quantities exist", () => {
    const half=[{approved:2,dispatched:2,inspected:1}];
    expect(plan({status:"DISPATCHED",actorSide:"SELLER",lines:half}))
      .toBe("PARTIALLY_INSPECTED");
    expect(plan({status:"PARTIALLY_INSPECTED",actorSide:"SELLER",lines:half}))
      .toBeNull();
    expect(plan({status:"PARTIALLY_INSPECTED",actorSide:"SELLER",lines:done}))
      .toBe("INSPECTED");
  });
  it("rejects inconsistent numbers or empty lines", () => {
    for (const lines of [[],[{approved:2,dispatched:3,inspected:1}],
      [{approved:1,dispatched:1,inspected:2}],
      [{approved:-1,dispatched:0,inspected:0}]]) {
      expect(plan({status:"DISPATCHED",actorSide:"SELLER",lines}))
        .toBeNull();
    }
  });
});
