import { describe,expect,it } from "vitest";
import { purchaseLinePackSnapshot } from "./purchase-pack";

describe("base-unit purchasing and pack snapshots",()=>{
  it("does not change an individual-unit purchase",()=>{
    expect(purchaseLinePackSnapshot({purchaseMode:"UNIT",caseQty:null,orderUnit:null},9))
      .toEqual({packSize:null,packCount:null,packUnit:null});
  });
  it("records supplier pack size and converts base units to whole packs",()=>{
    expect(purchaseLinePackSnapshot({purchaseMode:"PACK",caseQty:10,orderUnit:"箱"},20))
      .toEqual({packSize:10,packCount:2,packUnit:"箱"});
  });
  it("rejects fractional packs even with a valid unit",()=>{
    expect(()=>purchaseLinePackSnapshot({purchaseMode:"PACK",caseQty:10,orderUnit:"箱"},9))
      .toThrow(/整数倍/);
  });
  it("rejects missing/invalid pack sizing and invalid quantities",()=>{
    expect(()=>purchaseLinePackSnapshot({purchaseMode:"PACK",caseQty:null,orderUnit:"パック"},10))
      .toThrow();
    expect(()=>purchaseLinePackSnapshot({purchaseMode:"UNIT",caseQty:null,orderUnit:null},0))
      .toThrow();
  });
});
