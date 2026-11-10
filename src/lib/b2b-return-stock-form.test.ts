import { describe, expect, it } from "vitest";
import { parseBuyerReturnDispatch, parseSellerReturnInspection } from "./b2b-return-stock-form";

const EVENT = "d3657a9a-c5ac-4190-b5ad-95bed8039c48";
function base() {
  const f = new FormData();
  f.set("requestId", "request-01");
  f.set("returnItemId", "item-01");
  f.set("eventId", EVENT);
  f.set("confirmed", "yes");
  f.set("quantity", "2");
  f.set("receivedNow", "2");
  f.set("saleable", "1");
  f.set("unsaleable", "1");
  return f;
}
describe("physical return form is untrusted input", () => {
  it("parses dispatch and balanced inspection", () => {
    expect(parseBuyerReturnDispatch(base())).toEqual({
      requestId:"request-01",returnItemId:"item-01",eventId:EVENT,quantity:2,
    });
    expect(parseSellerReturnInspection(base())).toEqual({
      requestId:"request-01",returnItemId:"item-01",eventId:EVENT,
      receivedNow:2,saleable:1,unsaleable:1,
    });
  });
  it("rejects malformed dispatch integers, ids and missing confirmation", () => {
    for (const [key,value] of [
      ["quantity","0"],["quantity","-1"],["quantity","1.5"],
      ["quantity","2e1"],["quantity","2147483648"],
      ["returnItemId","../other"],["eventId","not-a-uuid"],
      ["confirmed","no"],["requestId",""],
    ]) {
      const data=base();
      data.set(key,value);
      expect(() => parseBuyerReturnDispatch(data)).toThrow();
    }
    const dupe=base();
    dupe.append("quantity","1");
    expect(() => parseBuyerReturnDispatch(dupe)).toThrow();
  });
  it("rejects inspection arithmetic and noninteger values", () => {
    for (const [key,value] of [
      ["receivedNow","0"],["saleable","3"],["saleable","1.5"],
      ["unsaleable","-1"],["unsaleable","1e1"],
    ]) {
      const data=base();
      data.set(key,value);
      expect(() => parseSellerReturnInspection(data)).toThrow();
    }
  });
  it("allows all-unsaleable with no stock restock", () => {
    const f=base();
    f.set("saleable","0");
    f.set("unsaleable","2");
    expect(parseSellerReturnInspection(f).saleable).toBe(0);
  });
});
