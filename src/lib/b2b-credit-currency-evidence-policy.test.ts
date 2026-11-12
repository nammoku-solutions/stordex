import { describe, expect, it } from "vitest";
import {
  assessInvoiceCurrencyEvidence as assess,
  type InvoiceCurrencyEvidenceInput,
} from "./b2b-credit-currency-evidence-policy";

const hash = "ab".repeat(32);
const doc = "cd".repeat(32);

function base(): InvoiceCurrencyEvidenceInput {
  return {
    invoiceId: "invoice-1",
    sellerTenantId: "seller-1",
    invoiceStatus: "ISSUED",
    trustedInvoiceSnapshotSha256: hash,
    review: {
      documentKind: "ORIGINAL_ISSUED_INVOICE",
      documentSha256: doc,
      documentExplicitCurrency: "JPY",
      invoiceId: "invoice-1",
      sellerTenantId: "seller-1",
      invoiceSnapshotSha256: hash,
      submittedByUserId: "u-maker",
      submittedAt: "2026-11-11T01:00:00.000Z",
      reviewedByUserId: "u-reviewer",
      reviewedBySellerTenantId: "seller-1",
      reviewerRole: "OWNER",
      reviewerActive: true,
      reviewedAt: "2026-11-11T02:00:00.000Z",
      reviewMethod: "INDEPENDENT_ORIGINAL_DOCUMENT_INSPECTION",
      status: "VERIFIED",
    },
  };
}

describe("original issued-invoice currency evidence — pure fail-closed", () => {
  it("accepts only independently verified, matching invoice/document snapshot", () => {
    expect(assess(base())).toEqual({
      currencyVerified: true,
      currencyCode: "JPY",
      documentSha256: doc,
      invoiceSnapshotSha256: hash,
      reviewerUserId: "u-reviewer",
      financialPostingAllowed: false,
    });
  });

  it("refuses missing invoice status/document and never treats checkbox as proof", () => {
    expect(assess({...base(),invoiceStatus:"DRAFT"})).toEqual({
      currencyVerified:false,blocker:"INVOICE_NOT_ELIGIBLE",
    });
    expect(assess({...base(),review:null})).toEqual({
      currencyVerified:false,blocker:"MISSING_EVIDENCE",
    });
    const x=base();
    expect(assess({...x,review:{...x.review!,documentSha256:"JPY checkbox"}})).toEqual({
      currencyVerified:false,blocker:"INVALID_DOCUMENT",
    });
  });

  it("refuses missing or non-JPY currency on the verified ORIGINAL document", () => {
    const x=base();
    for(const currency of ["USD","AUD","jpy",""]) {
      expect(assess({...x,review:{...x.review!,documentExplicitCurrency:currency}}))
        .toEqual({currencyVerified:false,blocker:"CURRENCY_MISMATCH"});
    }
  });

  it("refuses cross-tenant evidence and source Invoice mismatch", () => {
    const x=base();
    expect(assess({...x,review:{...x.review!,sellerTenantId:"buyer-1"}}))
      .toEqual({currencyVerified:false,blocker:"WRONG_SELLER_OR_INVOICE"});
    expect(assess({...x,review:{...x.review!,invoiceId:"unrelated"}}))
      .toEqual({currencyVerified:false,blocker:"WRONG_SELLER_OR_INVOICE"});
    expect(assess({...x,review:{...x.review!,reviewedBySellerTenantId:"buyer-1"}}))
      .toEqual({currencyVerified:false,blocker:"WRONG_SELLER_OR_INVOICE"});
  });

  it("refuses stale, fake or non-digest source hashes", () => {
    const x=base();
    expect(assess({...x,trustedInvoiceSnapshotSha256:"bad"}))
      .toEqual({currencyVerified:false,blocker:"UNTRUSTED_INVOICE_SNAPSHOT"});
    expect(assess({...x,review:{...x.review!,invoiceSnapshotSha256:"ef".repeat(32)}}))
      .toEqual({currencyVerified:false,blocker:"UNTRUSTED_INVOICE_SNAPSHOT"});
  });

  it("refuses non-verified, revoked, rejected, pending or non-independent evidence", () => {
    const x=base();
    for(const status of ["PENDING","REVOKED","REJECTED"] as const) {
      expect(assess({...x,review:{...x.review!,status}}))
        .toEqual({currencyVerified:false,blocker:"EVIDENCE_NOT_VERIFIED"});
    }
    expect(assess({...x,review:{...x.review!,reviewMethod:"NONE"}}))
      .toEqual({currencyVerified:false,blocker:"EVIDENCE_NOT_VERIFIED"});
  });

  it("requires active seller OWNER/ADMIN reviewer independent from uploader", () => {
    const x=base();
    expect(assess({...x,review:{...x.review!,reviewedByUserId:"u-maker"}}))
      .toEqual({currencyVerified:false,blocker:"SELF_VERIFICATION"});
    for(const role of ["STAFF","BUYER","owner",null]) {
      expect(assess({...x,review:{...x.review!,reviewerRole:role}}))
        .toEqual({currencyVerified:false,blocker:"INVALID_VERIFIER"});
    }
    expect(assess({...x,review:{...x.review!,reviewerActive:false}}))
      .toEqual({currencyVerified:false,blocker:"INVALID_VERIFIER"});
  });

  it("requires valid chronological UTC submission and review timestamps", () => {
    const x=base();
    expect(assess({...x,review:{...x.review!,reviewedAt:"2026-11-10T23:59:00.000Z"}}))
      .toEqual({currencyVerified:false,blocker:"INVALID_EVIDENCE_TIMESTAMPS"});
    expect(assess({...x,review:{...x.review!,submittedAt:"2026-02-30T00:00:00Z"}}))
      .toEqual({currencyVerified:false,blocker:"INVALID_EVIDENCE_TIMESTAMPS"});
    expect(assess({...x,review:{...x.review!,reviewedAt:null}}))
      .toEqual({currencyVerified:false,blocker:"INVALID_EVIDENCE_TIMESTAMPS"});
  });
});
