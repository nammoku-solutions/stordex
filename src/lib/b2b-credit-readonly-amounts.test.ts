import { describe, expect, it } from "vitest";
import {
  previewB2BCreditAmounts as preview,
  type CreditPreviewInput,
} from "./b2b-credit-readonly-amounts";

function stagingCase(): CreditPreviewInput {
  return {
    sellerConfirmedOriginalInvoiceJPY: true,
    otherActiveCreditNoteCount: 0,
    invoice: {
      id: "invoice-1", status: "ISSUED", subtotal: 4400,
      tax: 440, total: 4840, taxRate: 10, taxPerOrder: false,
      orderIds: ["seller-order-1"],
    },
    orders: [{
      id: "seller-order-1", subtotal: 4400, tax: 440,
      total: 4840, taxRate: 10,
      lines: [{ id: "line-1", quantity: 5, unitPrice: 880, amount: 4400 }],
    }],
    allocations: [{
      orderId: "seller-order-1", orderLineId: "line-1",
      creditedQuantity: 2, approvedQuantity: 2,
      inspectedQuantity: 2, otherActiveAllocatedQuantity: 0,
    }],
  };
}

function twoOrders(taxPerOrder: boolean): CreditPreviewInput {
  return {
    sellerConfirmedOriginalInvoiceJPY: true,
    otherActiveCreditNoteCount: 0,
    invoice: {
      id: "invoice-2", status: "PAID", subtotal: 310,
      tax: taxPerOrder ? 26 : 31, total: taxPerOrder ? 336 : 341,
      taxRate: 10, taxPerOrder, orderIds: ["order-a", "order-b"],
    },
    orders: [
      {
        id: "order-a", subtotal: 105, tax: 10, total: 115, taxRate: 10,
        lines: [
          { id: "a-1", quantity: 1, unitPrice: 104, amount: 104 },
          { id: "a-2", quantity: 1, unitPrice: 1, amount: 1 },
        ],
      },
      {
        id: "order-b", subtotal: 205, tax: 16, total: 221, taxRate: 8,
        lines: [
          { id: "b-1", quantity: 1, unitPrice: 192, amount: 192 },
          { id: "b-2", quantity: 1, unitPrice: 13, amount: 13 },
        ],
      },
    ],
    allocations: [
      {orderId:"order-a",orderLineId:"a-2",creditedQuantity:1,
       approvedQuantity:1,inspectedQuantity:1,otherActiveAllocatedQuantity:0},
      {orderId:"order-b",orderLineId:"b-2",creditedQuantity:1,
       approvedQuantity:1,inspectedQuantity:1,otherActiveAllocatedQuantity:0},
    ],
  };
}

describe("read-only CreditNote amount planning — no issuance/settlement", () => {
  it("projects 2 returned boxes without writing money for the Staging fixture", () => {
    expect(preview(stagingCase())).toMatchObject({
      ready: true, currencyCode: "JPY", taxMode: "INVOICE_DIFFERENCE",
      creditedSubtotal: 1760, creditedTax: 176, creditedTotal: 1936,
      remainingInvoiceSubtotal: 2640, remainingInvoiceTax: 264,
      remainingInvoiceTotal: 2904, sourceInvoiceTotal: 4840,
      financialPostingAllowed: false,
    });
  });

  it("returns exactly the original totals on a verified full return", () => {
    const input = stagingCase();
    expect(preview({
      ...input,
      allocations: [{...input.allocations[0],creditedQuantity:5,
        approvedQuantity:5,inspectedQuantity:5}],
    })).toMatchObject({
      ready: true, creditedSubtotal: 4400, creditedTax: 440,
      creditedTotal: 4840, remainingInvoiceTotal: 0,
      financialPostingAllowed: false,
    });
  });

  it("uses the invoice tax difference for partial-return floor rounding", () => {
    const input = stagingCase();
    const modified: CreditPreviewInput = {
      ...input,
      invoice: {...input.invoice,subtotal:109,tax:10,total:119},
      orders: [{
        id:"seller-order-1",subtotal:109,tax:10,total:119,taxRate:10,
        lines:[
          {id:"small",quantity:1,unitPrice:10,amount:10},
          {id:"rest",quantity:1,unitPrice:99,amount:99},
        ],
      }],
      allocations: [{
        orderId:"seller-order-1",orderLineId:"small",
        creditedQuantity:1,approvedQuantity:1,inspectedQuantity:1,
        otherActiveAllocatedQuantity:0,
      }],
    };
    // floor(109 * .10)=10 and floor(99 * .10)=9: delta=1.
    expect(preview(modified)).toMatchObject({
      ready:true,creditedSubtotal:10,creditedTax:1,creditedTotal:11,
      remainingInvoiceSubtotal:99,remainingInvoiceTax:9,
      remainingInvoiceTotal:108,
    });
  });

  it("calculates each original order separately when taxPerOrder=true", () => {
    expect(preview(twoOrders(true))).toMatchObject({
      ready:true,taxMode:"PER_ORDER_DIFFERENCE",
      creditedSubtotal:14,creditedTax:1,creditedTotal:15,
      remainingInvoiceSubtotal:296,remainingInvoiceTax:25,
      remainingInvoiceTotal:321,
      orderProposals:[
        {orderId:"order-a",creditedSubtotal:1,creditedTax:0},
        {orderId:"order-b",creditedSubtotal:13,creditedTax:1},
      ],
    });
  });

  it("does not falsely allocate invoice-level tax to individual orders", () => {
    expect(preview(twoOrders(false))).toMatchObject({
      ready:true,taxMode:"INVOICE_DIFFERENCE",
      creditedSubtotal:14,creditedTax:2,creditedTotal:16,
      remainingInvoiceTax:29,
      orderProposals:[
        {orderId:"order-a",creditedSubtotal:1,creditedTax:null},
        {orderId:"order-b",creditedSubtotal:13,creditedTax:null},
      ],
    });
  });

  it("is fail-closed without explicitly confirmed invoice currency provenance", () => {
    const input=stagingCase();
    expect(preview({...input,sellerConfirmedOriginalInvoiceJPY:false})).toEqual({
      ready:false,blocker:"JPY_PROVENANCE_UNCONFIRMED",
    });
  });

  it("blocks unissued invoices, any other active credits and invalid count", () => {
    const input=stagingCase();
    for (const status of ["DRAFT","CANCELLED"]) {
      expect(preview({...input,invoice:{...input.invoice,status}})).toEqual({
        ready:false,blocker:"INVOICE_NOT_ISSUED",
      });
    }
    expect(preview({...input,otherActiveCreditNoteCount:1})).toEqual({
      ready:false,blocker:"ALREADY_ACTIVE_CREDIT_NOTE",
    });
    expect(preview({...input,otherActiveCreditNoteCount:-1})).toEqual({
      ready:false,blocker:"INVALID_SOURCE",
    });
  });

  it("refuses partial/invented source invoices and cross-order lines", () => {
    const input=twoOrders(true);
    expect(preview({...input,orders:input.orders.slice(0,1)})).toEqual({
      ready:false,blocker:"INVOICE_ORDERS_INCOMPLETE",
    });
    expect(preview({...input,invoice:{...input.invoice,orderIds:["order-a","order-a"]}})).toEqual({
      ready:false,blocker:"INVOICE_ORDERS_INCOMPLETE",
    });
    expect(preview({...input,allocations:[{...input.allocations[0],
      orderId:"order-b"}]})).toEqual({
      ready:false,blocker:"CREDIT_LINE_NOT_IN_INVOICE",
    });
    expect(preview({...input,allocations:[input.allocations[0],input.allocations[0]]})).toEqual({
      ready:false,blocker:"CREDIT_LINE_NOT_IN_INVOICE",
    });
  });

  it("refuses stale tax, line prices, subtotal and tax-method snapshots", () => {
    const input=stagingCase();
    expect(preview({...input,invoice:{...input.invoice,tax:439,total:4839}})).toEqual({
      ready:false,blocker:"ORIGINAL_TOTALS_MISMATCH",
    });
    expect(preview({...input,orders:[{...input.orders[0],
      lines:[{...input.orders[0].lines[0],amount:4399}]}]})).toEqual({
      ready:false,blocker:"ORIGINAL_TOTALS_MISMATCH",
    });
    expect(preview({...input,invoice:{...input.invoice,taxPerOrder:true},
      orders:[{...input.orders[0],tax:439,total:4839}]})).toEqual({
      ready:false,blocker:"ORIGINAL_TOTALS_MISMATCH",
    });
    expect(preview({...input,invoice:{...input.invoice,taxRate:101}})).toEqual({
      ready:false,blocker:"INVALID_SOURCE",
    });
  });

  it("refuses uninspected, duplicated or over-reserved return quantities", () => {
    const input=stagingCase();
    expect(preview({...input,allocations:[{...input.allocations[0],
      inspectedQuantity:1}]})).toEqual({
      ready:false,blocker:"INVALID_INSPECTED_QUANTITY",
    });
    expect(preview({...input,allocations:[{...input.allocations[0],
      otherActiveAllocatedQuantity:1}]})).toEqual({
      ready:false,blocker:"INVALID_INSPECTED_QUANTITY",
    });
    expect(preview({...input,allocations:[{...input.allocations[0],
      creditedQuantity:6,approvedQuantity:6,inspectedQuantity:6}]})).toEqual({
      ready:false,blocker:"INVALID_INSPECTED_QUANTITY",
    });
  });

  it("rejects overflow rather than silently returning imprecise yen", () => {
    const input=stagingCase();
    expect(preview({...input,invoice:{...input.invoice,subtotal:3_000_000_000,
      tax:300_000_000,total:3_300_000_000}})).toEqual({
      ready:false,blocker:"INVALID_SOURCE",
    });
  });
});
