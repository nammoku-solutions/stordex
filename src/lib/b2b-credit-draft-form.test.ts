import { describe,expect,it } from "vitest";
import { parseCreditDraftForm as parse } from "./b2b-credit-draft-form";
const uuid="eea2b475-221e-4b37-b911-374ee83409e2";
function sample() {
  const f=new FormData();
  f.set("returnRequestId","return_001");
  f.set("originalInvoiceId","invoice_002");
  f.set("idempotencyKey",uuid);
  f.set("confirmed","yes");
  f.append("returnItemId","line_A"); f.append("creditedQuantity","2");
  f.append("returnItemId","line_B"); f.append("creditedQuantity","0");
  return f;
}
describe("CreditNote DRAFT form parsing",()=>{
  it("keeps positive allocations only, exact UUID and validated IDs",()=>{
    expect(parse(sample())).toEqual({
      returnRequestId:"return_001",originalInvoiceId:"invoice_002",
      idempotencyKey:uuid,lines:[{returnItemId:"line_A",creditedQuantity:2}],
    });
  });
  it("rejects bad IDs, UUID, confirmation and duplicate parameters",()=>{
    for(const [name,value] of [
      ["returnRequestId","../outside"],["originalInvoiceId",""],
      ["idempotencyKey","reused-key"],["confirmed","no"],
      ["creditedQuantity","-1"],["creditedQuantity","1.4"],
      ["creditedQuantity","99999999999"],["returnItemId","../../other"]
    ]) {
      const f=sample();if(name==="creditedQuantity"||name==="returnItemId")f.delete(name);
      f.set(name,value);
      expect(()=>parse(f)).toThrow();
    }
    const f=sample();f.append("originalInvoiceId","another");
    expect(()=>parse(f)).toThrow();
    const dup=sample();dup.set("returnItemId","line_A");dup.append("returnItemId","line_A");
    dup.append("creditedQuantity","1");expect(()=>parse(dup)).toThrow();
  });
  it("rejects zero-only and excess form rows",()=>{
    const f=sample();f.delete("creditedQuantity");
    f.append("creditedQuantity","0");f.append("creditedQuantity","0");
    expect(()=>parse(f)).toThrow();
    const bad=sample();bad.append("returnItemId","line_C");
    expect(()=>parse(bad)).toThrow();
  });
});
