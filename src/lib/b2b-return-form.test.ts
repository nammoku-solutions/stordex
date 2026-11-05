import { describe, expect, it } from "vitest";
import { parseReturnSubmission, parseReturnReview } from "./b2b-return-form";

const KEY = "b6b8eab9-4045-41df-8ab4-adef0122fb57";
function makeSubmission() {
  const f = new FormData();
  f.set("companyId", "company-1");
  f.set("idempotencyKey", KEY);
  f.append("sourceLineId", "line-1");
  f.set("quantity_line-1", "2");
  f.set("reason_line-1", "DAMAGED");
  f.set("note_line-1", "damaged case");
  f.append("sourceLineId", "line-2");
  f.set("quantity_line-2", "0");
  f.set("reason_line-2", "OTHER");
  f.set("note_line-2", "");
  return f;
}
describe("return form payloads (untrusted browser data)", () => {
  it("submits only nonzero lines without changing the idempotency key", () => {
    expect(parseReturnSubmission(makeSubmission())).toEqual({
      companyId: "company-1", idempotencyKey: KEY,
      lines: [{sourceLineId:"line-1", requestedQuantity:2,
        reason:"DAMAGED", note:"damaged case"}],
    });
  });
  it("rejects forged values, unexpected files, invalid quantities and empty requests", () => {
    for(const [field,value] of [
      ["quantity_line-1","-1"],
      ["quantity_line-1","2.5"],
      ["quantity_line-1","2147483648"],
      ["quantity_line-1","2e2"],
      ["reason_line-1","NO_REASON"],
      ["companyId",""],
    ]) {
      const f = makeSubmission();
      f.set(field,value);
      expect(() => parseReturnSubmission(f)).toThrow();
    }
    const duplicate = makeSubmission();
    duplicate.append("sourceLineId","line-1");
    expect(() => parseReturnSubmission(duplicate)).toThrow("重複");
    const empty = makeSubmission();
    empty.set("quantity_line-1","0");
    expect(() => parseReturnSubmission(empty)).toThrow("少なくとも");
    const unsafe = makeSubmission();
    unsafe.set("sourceLineId","../other-company");
    expect(() => parseReturnSubmission(unsafe)).toThrow();
    const long = makeSubmission();
    long.set("note_line-1","あ".repeat(501));
    expect(() => parseReturnSubmission(long)).toThrow("500");
    const file = makeSubmission();
    file.set("quantity_line-1",new File(["1"],"some.txt"));
    expect(() => parseReturnSubmission(file)).toThrow();
  });
  it("passes a seller review with explicit per-line quantities", () => {
    const f=new FormData();
    f.set("requestId","request-1");
    f.append("sourceLineId","line-1");
    f.append("sourceLineId","line-2");
    f.set("approved_line-1","2");
    f.set("approved_line-2","0");
    f.set("reviewNote","  review completed ");
    expect(parseReturnReview(f)).toEqual({
      requestId:"request-1",
      decisions:[{sourceLineId:"line-1",approvedQuantity:2},
        {sourceLineId:"line-2",approvedQuantity:0}],
      reviewNote:"review completed",
    });
    f.set("approved_line-1","3.2");
    expect(() => parseReturnReview(f)).toThrow();
  });
});
