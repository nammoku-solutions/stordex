import { describe, expect, it } from "vitest";
import {
  assessCreditApprovalReadiness as assess,
  type CreditApprovalReadinessInput,
} from "./b2b-credit-approval-readiness";

const invoiceHash = "ab".repeat(32);
const amountHash = "cd".repeat(32);
const documentHash = "ef".repeat(32);

function base(): CreditApprovalReadinessInput {
  return {
    draft: {
      creditNoteId: "credit-2", status: "DRAFT", sellerTenantId: "seller-1",
      invoiceId: "invoice-1", createdByUserId: "u-maker",
      invoiceSnapshotSha256: invoiceHash,
      computedAmountsSha256: amountHash,
      proposedSubtotal: 1760, proposedTax: 176, proposedTotal: 1936,
    },
    maker: {userId:"u-maker",tenantId:"seller-1",role:"ADMIN",active:true},
    checker: {userId:"u-checker",tenantId:"seller-1",role:"OWNER",active:true},
    originalInvoice: {
      id:"invoice-1",sellerTenantId:"seller-1",status:"ISSUED",
      total:4840,trustedInvoiceSnapshotSha256:invoiceHash,
    },
    currencyEvidence: {
      invoiceId:"invoice-1",sellerTenantId:"seller-1",
      invoiceStatus:"ISSUED",trustedInvoiceSnapshotSha256:invoiceHash,
      review: {
        documentKind:"ORIGINAL_ISSUED_INVOICE",
        documentSha256:documentHash,
        documentExplicitCurrency:"JPY",
        invoiceId:"invoice-1",
        sellerTenantId:"seller-1",
        invoiceSnapshotSha256:invoiceHash,
        submittedByUserId:"u-upload",
        submittedAt:"2026-11-11T08:00:00.000Z",
        reviewedByUserId:"u-evidence-reviewer",
        reviewedBySellerTenantId:"seller-1",
        reviewerRole:"ADMIN",
        reviewerActive:true,
        reviewedAt:"2026-11-11T09:00:00.000Z",
        reviewMethod:"INDEPENDENT_ORIGINAL_DOCUMENT_INSPECTION",
        status:"VERIFIED",
      },
    },
    accountingSignoff: {
      signerUserId:"u-checker",sellerTenantId:"seller-1",signerRole:"OWNER",
      signerActive:true,signedAmountHashSha256:amountHash,
      sourceInvoiceHashSha256:invoiceHash,status:"APPROVED",
    },
    competingOpenOrPostedCreditCount:0,
  };
}

describe("CreditNote maker/checker design-only preflight (no accounting issuance)", () => {
  it("demonstrates a valid hypothetical review case while always forbidding posting and state changes", () => {
    expect(assess(base())).toEqual({
      readyForFutureApprovalDesign:true,
      checkedGross:1936,currencyCode:"JPY",makerUserId:"u-maker",
      checkerUserId:"u-checker",
      financialPostingAllowed:false,stateChangeAllowed:false,
    });
  });

  it("blocks VOID or cancelled original invoice and mismatched identities", () => {
    const x=base();
    expect(assess({...x,draft:{...x.draft,status:"VOID"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"INVALID_CREDIT_STATE"});
    expect(assess({...x,originalInvoice:{...x.originalInvoice,status:"CANCELLED"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"INVALID_CREDIT_STATE"});
    expect(assess({...x,draft:{...x.draft,invoiceId:"other-invoice"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"INVALID_CREDIT_STATE"});
    expect(assess({...x,draft:{...x.draft,createdByUserId:"attacker"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"INVALID_CREDIT_STATE"});
  });

  it("refuses inactive maker/STAFF and same-person/foreign-tenant checker", () => {
    const x=base();
    expect(assess({...x,maker:{...x.maker,role:"STAFF"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"NOT_SELLER_MANAGER"});
    expect(assess({...x,maker:{...x.maker,active:false}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"NOT_SELLER_MANAGER"});
    expect(assess({...x,checker:{...x.checker,userId:"u-maker"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"SAME_MAKER_AND_CHECKER"});
    expect(assess({...x,checker:{...x.checker,tenantId:"buyer-1"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"WRONG_SELLER_CHECKER"});
    expect(assess({...x,checker:{...x.checker,role:"STAFF"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"WRONG_SELLER_CHECKER"});
    expect(assess({...x,checker:{...x.checker,active:false}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"WRONG_SELLER_CHECKER"});
  });

  it("requires trusted immutable original invoice hash across credit and evidence", () => {
    const x=base();
    expect(assess({...x,draft:{...x.draft,invoiceSnapshotSha256:"bad"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"INVOICE_SNAPSHOT_MISMATCH"});
    expect(assess({...x,currencyEvidence:{...x.currencyEvidence,
      trustedInvoiceSnapshotSha256:"77".repeat(32)}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"INVOICE_SNAPSHOT_MISMATCH"});
    expect(assess({...x,currencyEvidence:{...x.currencyEvidence,
      invoiceId:"other"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"INVOICE_SNAPSHOT_MISMATCH"});
  });

  it("does not accept a checkbox, missing source document or pending evidence", () => {
    const x=base();
    expect(assess({...x,currencyEvidence:{...x.currencyEvidence,review:null}}))
      .toEqual({
        readyForFutureApprovalDesign:false,blocker:"UNVERIFIED_SOURCE_CURRENCY",
        currencyBlocker:"MISSING_EVIDENCE",
      });
    expect(assess({...x,currencyEvidence:{...x.currencyEvidence,review:{
      ...x.currencyEvidence.review!,status:"PENDING",
    }}})).toEqual({
      readyForFutureApprovalDesign:false,blocker:"UNVERIFIED_SOURCE_CURRENCY",
      currencyBlocker:"EVIDENCE_NOT_VERIFIED",
    });
  });

  it("refuses inconsistent amounts, oversized originals and competing credit obligations", () => {
    const x=base();
    expect(assess({...x,draft:{...x.draft,proposedTotal:1935}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"AMOUNT_NOT_RECOMPUTED"});
    expect(assess({...x,draft:{...x.draft,computedAmountsSha256:"bad"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"AMOUNT_NOT_RECOMPUTED"});
    expect(assess({...x,originalInvoice:{...x.originalInvoice,total:1500}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"INVOICE_CAP_EXCEEDED"});
    expect(assess({...x,competingOpenOrPostedCreditCount:1}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"ACTIVE_OR_POSTED_CREDIT_EXISTS"});
    expect(assess({...x,competingOpenOrPostedCreditCount:-1}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"ACTIVE_OR_POSTED_CREDIT_EXISTS"});
  });

  it("refuses unsigned tax math, stale source hash, wrong signer and self-signoff", () => {
    const x=base();
    expect(assess({...x,accountingSignoff:null}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"TAX_SIGNOFF_MISSING"});
    expect(assess({...x,accountingSignoff:{...x.accountingSignoff!,status:"PENDING"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"TAX_SIGNOFF_MISSING"});
    expect(assess({...x,accountingSignoff:{...x.accountingSignoff!,signerUserId:"u-maker"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"TAX_SIGNOFF_MISSING"});
    expect(assess({...x,accountingSignoff:{...x.accountingSignoff!,
      signedAmountHashSha256:"88".repeat(32)}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"TAX_SIGNOFF_MISSING"});
    expect(assess({...x,accountingSignoff:{...x.accountingSignoff!,
      sourceInvoiceHashSha256:"99".repeat(32)}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"TAX_SIGNOFF_MISSING"});
    expect(assess({...x,accountingSignoff:{...x.accountingSignoff!,sellerTenantId:"buyer-1"}}))
      .toEqual({readyForFutureApprovalDesign:false,blocker:"TAX_SIGNOFF_MISSING"});
  });
});
