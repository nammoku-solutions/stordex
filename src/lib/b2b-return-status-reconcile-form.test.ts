import { describe, expect, it } from "vitest";
import { parseReturnStatusReconcileForm } from "./b2b-return-status-reconcile-form";

const UUID="eea2b475-221e-4b37-b911-374ee83409e2";
function form() {
  const f=new FormData();
  f.set("returnRequestId","cmlinerequest001");
  f.set("eventId",UUID);
  f.set("expectedStatus","PARTIALLY_APPROVED");
  f.set("targetStatus","DISPATCHED");
  f.set("confirmed","yes");
  return f;
}
describe("formal status reconciliation input validation", () => {
  it("accepts only explicit approved physical transitions", () => {
    expect(parseReturnStatusReconcileForm(form())).toEqual({
      returnRequestId:"cmlinerequest001",eventId:UUID,
      expectedStatus:"PARTIALLY_APPROVED",targetStatus:"DISPATCHED",
    });
    for (const [from,to] of [
      ["APPROVED","DISPATCHED"],
      ["DISPATCHED","PARTIALLY_INSPECTED"],
      ["DISPATCHED","INSPECTED"],
      ["PARTIALLY_INSPECTED","INSPECTED"],
    ]) {
      const f=form();
      f.set("expectedStatus",from);
      f.set("targetStatus",to);
      expect(parseReturnStatusReconcileForm(f)).toMatchObject({
        expectedStatus:from,targetStatus:to,
      });
    }
  });
  it("rejects forged, skipping, financial or replay states", () => {
    for (const [key,value] of [
      ["returnRequestId","../bad"],
      ["returnRequestId",""],
      ["eventId","not-uuid"],
      ["targetStatus","CREDIT_PENDING"],
      ["targetStatus","CLOSED"],
      ["targetStatus","INSPECTED"],
      ["expectedStatus","CLOSED"],
      ["expectedStatus","SUBMITTED"],
      ["confirmed","no"],
    ]) {
      const f=form();f.set(key,value);
      expect(() => parseReturnStatusReconcileForm(f)).toThrow();
    }
    const duplicate=form();duplicate.append("targetStatus","INSPECTED");
    expect(() => parseReturnStatusReconcileForm(duplicate)).toThrow();
  });
});
