import { describe,expect,it } from "vitest";
import { assessCreditDraftReadiness as assess } from "./b2b-credit-draft-readiness";
const base={
  returnStatus:"INSPECTED",approved:2,inspected:2,alreadyAllocated:0,
  sellerOrderId:"seller-order-1",sellerTenantId:"seller-1",
  originalInvoice:{status:"ISSUED",tenantId:"seller-1",orderIds:["seller-order-1"]},
};
describe("CreditNote preparation readiness (not issuance)",()=>{
  it("blocks the existing staging UAT when it has no original invoice",()=>{
    expect(assess({...base,originalInvoice:null})).toMatchObject({
      canPrepareDraft:false,blocker:"ORIGINAL_INVOICE_NOT_FOUND"
    });
  });
  it("returns the remaining quantity only for a linked issued or paid invoice",()=>{
    expect(assess(base)).toEqual({
      canPrepareDraft:true,remainingInspectedUnits:2,blocker:null
    });
    expect(assess({...base,alreadyAllocated:1})).toMatchObject({
      canPrepareDraft:true,remainingInspectedUnits:1
    });
    expect(assess({...base,originalInvoice:{...base.originalInvoice,status:"PAID"}}).canPrepareDraft).toBe(true);
  });
  it("blocks issued invoice from other seller or unrelated order",()=>{
    expect(assess({...base,originalInvoice:{...base.originalInvoice,tenantId:"other"}}).blocker).toBe("ORIGINAL_INVOICE_WRONG_SELLER");
    expect(assess({...base,originalInvoice:{...base.originalInvoice,orderIds:["other-order"]}}).blocker).toBe("ORIGINAL_INVOICE_WRONG_ORDER");
  });
  it("blocks unissued/cancelled invoice and non-inspected returns",()=>{
    for(const status of ["DRAFT","CANCELLED"]) {
      expect(assess({...base,originalInvoice:{...base.originalInvoice,status}}).blocker).toBe("ORIGINAL_INVOICE_NOT_ISSUED");
    }
    expect(assess({...base,returnStatus:"DISPATCHED"}).blocker).toBe("RETURN_NOT_INSPECTED");
    expect(assess({...base,sellerOrderId:null}).blocker).toBe("SOURCE_ORDER_NOT_LINKED");
  });
  it("rejects unit over-allocation and exhausted draft budget",()=>{
    expect(assess({...base,alreadyAllocated:3}).blocker).toBe("INVALID_QUANTITIES");
    expect(assess({...base,inspected:3}).blocker).toBe("INVALID_QUANTITIES");
    expect(assess({...base,alreadyAllocated:2}).blocker).toBe("ALREADY_FULLY_ALLOCATED");
  });
});
