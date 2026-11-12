import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computeOriginalInvoiceFinancialFingerprint as fingerprint,
  compareOriginalInvoiceBytesToTrustedDigest as verifyBytes,
  type OriginalInvoiceFinancialSource,
} from "./b2b-credit-source-integrity";

function example():OriginalInvoiceFinancialSource {
  return {
    invoiceId:"invoice-1",sellerTenantId:"seller-1",
    invoiceNumber:"I-202611-0001",
    issueDate:"2026-11-11T00:00:00.000Z",
    periodYear:2026,periodMonth:11,subtotal:4400,tax:440,total:4840,
    taxRate:10,taxPerOrder:false,
    orders:[{
      orderId:"order-A",sellerTenantId:"seller-1",
      subtotal:4400,tax:440,total:4840,taxRate:10,
      lines:[
        {lineId:"line-A",itemId:"item-1",quantity:2,unitPrice:880,amount:1760},
        {lineId:"line-B",itemId:"item-2",quantity:3,unitPrice:880,amount:2640},
      ],
    }],
  };
}

describe("immutable, order-independent Invoice financial source fingerprint",()=>{
  it("hashes a complete valid source with no financial authorization",()=>{
    const result=fingerprint(example());
    expect(result).toMatchObject({
      ready:true,orderCount:1,lineCount:2,financialPostingAllowed:false,
    });
    if(result.ready)expect(result.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is insensitive to line presentation order while catching true changes",()=>{
    const original=example(), baseline=fingerprint(original);
    const reordered={
      ...original,
      orders:original.orders.map(o=>({...o,lines:[...o.lines].reverse()})),
    };
    expect(fingerprint(reordered)).toEqual(baseline);
    const amended={
      ...original,
      orders:original.orders.map(o=>({...o,lines:o.lines.map(l=>
        l.lineId==="line-A"?{...l,itemId:"different-item"}:l)})),
    };
    expect(fingerprint(amended)).not.toEqual(baseline);
    expect(fingerprint({...original,invoiceId:"different-id"})).not.toEqual(baseline);
    expect(fingerprint({...original,sellerTenantId:"seller-other",
      orders:original.orders.map(o=>({...o,sellerTenantId:"seller-other"}))}))
      .not.toEqual(baseline);
  });

  it("blocks incomplete source, duplicates and cross-tenant substitution",()=>{
    const orig=example();
    expect(fingerprint({...orig,orders:[]})).toEqual({
      ready:false,blocker:"INCOMPLETE_SOURCE",
    });
    expect(fingerprint({...orig,orders:[...orig.orders,...orig.orders]})).toEqual({
      ready:false,blocker:"INVALID_INVOICE",
    });
    expect(fingerprint({...orig,orders:orig.orders.map(o=>({
      ...o,sellerTenantId:"foreign",
    }))})).toEqual({ready:false,blocker:"INVALID_INVOICE"});
    const line=orig.orders[0].lines[0];
    expect(fingerprint({...orig,orders:[{
      ...orig.orders[0],lines:[line,{...line}],
    }]})).toEqual({ready:false,blocker:"INVALID_LINE"});
  });

  it("fails closed on invalid quantities, inconsistent line totals and tax",()=>{
    const orig=example();
    const badQty={...orig,orders:[{...orig.orders[0],
      lines:orig.orders[0].lines.map((l,i)=>i===0?{...l,quantity:-1}:l),
    }]};
    expect(fingerprint(badQty)).toEqual({ready:false,blocker:"INVALID_LINE"});
    expect(fingerprint({...orig,orders:[{...orig.orders[0],subtotal:4399}]}))
      .toEqual({ready:false,blocker:"INVALID_INVOICE"});
    expect(fingerprint({...orig,subtotal:4399,total:4839}))
      .toEqual({ready:false,blocker:"AMOUNT_MISMATCH"});
    expect(fingerprint({...orig,tax:439,total:4839}))
      .toEqual({ready:false,blocker:"TAX_MISMATCH"});
    expect(fingerprint({...orig,issueDate:"2026-02-30T00:00:00.000Z"}))
      .toEqual({ready:false,blocker:"INVALID_INVOICE"});
  });

  it("separates invoice-wide from per-order taxation without per-line rounding",()=>{
    const orig=example();
    expect(fingerprint({...orig,taxPerOrder:true}).ready).toBe(true);
    expect(fingerprint({...orig,taxPerOrder:true,orders:[{
      ...orig.orders[0],tax:439,total:4839,
    }]})).toEqual({ready:false,blocker:"TAX_MISMATCH"});
    expect(fingerprint({...orig,taxPerOrder:false,orders:[{
      ...orig.orders[0],tax:439,total:4839,
    }]}).ready).toBe(true);
  });
});

describe("source file byte checksum is only a match, not a verification grant",()=>{
  it("compares bytes against independently trusted exact digest",()=>{
    const bytes=new TextEncoder().encode("%PDF-1.7\nCI-original-document\n");
    const trusted=createHash("sha256").update(bytes).digest("hex");
    expect(verifyBytes(bytes,trusted)).toBe(true);
    expect(verifyBytes(bytes,trusted.toUpperCase())).toBe(true);
    expect(verifyBytes(new TextEncoder().encode("different"),trusted)).toBe(false);
    expect(verifyBytes(bytes,"JPY checkbox")).toBe(false);
    expect(verifyBytes(new Uint8Array(),trusted)).toBe(false);
    expect(verifyBytes(new Uint8Array(10*1024*1024+1),trusted)).toBe(false);
    // Never elevate an unverified client hash to authentic invoice provenance.
  });
});
