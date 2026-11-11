import { describe,expect,it } from "vitest";
import { parseCreditVoidForm } from "./b2b-credit-void-form";
const e="eea2b475-221e-4b37-b911-374ee83409e2";
function form(){
  const f=new FormData();f.set("creditNoteId","draft-id");
  f.set("eventId",e);f.set("reason","取引先の返品内容の再確認が必要です");
  f.set("confirmed","yes");return f;
}
describe("Credit VOID form validation",()=>{
  it("accepts a single valid cancellation and reason",()=>{
    expect(parseCreditVoidForm(form())).toEqual({
      creditNoteId:"draft-id",eventId:e,reason:"取引先の返品内容の再確認が必要です",
    });
  });
  it("rejects duplicated parameters and untrusted values",()=>{
    for(const [field,value] of [
      ["creditNoteId","../evil"],["eventId","replay"],["confirmed","no"],
      ["reason","短い"],["reason","x".repeat(501)],
    ]){
      const f=form();f.set(field,value);
      expect(()=>parseCreditVoidForm(f)).toThrow();
    }
    const extra=form();extra.append("creditNoteId","other");
    expect(()=>parseCreditVoidForm(extra)).toThrow();
  });
});
