import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  prepareOriginalInvoiceForPrivateStorage as prepare,
  type OriginalInvoiceUploadContext,
} from "./b2b-credit-original-document-policy";

function context():OriginalInvoiceUploadContext {
  return {
    authenticatedUserId:"seller-admin-123",
    authenticatedTenantId:"seller-abc",
    authenticatedRole:"ADMIN",
    tenantActive:true,
    trustedInvoiceId:"invoice-xyz",
    trustedInvoiceSellerTenantId:"seller-abc",
    trustedInvoiceStatus:"ISSUED",
  };
}
const payload=(text:string)=>new TextEncoder().encode(text);
const good=()=>({
  context:context(),
  filename:"issued-invoice.pdf",
  mimeType:"application/pdf",
  bytes:payload("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"),
});

describe("seller-only original invoice PDF intake candidate (never actual storage)",()=>{
  it("proposes a random private namespaced key and SHA-256, with every trust gate still CLOSED",()=>{
    const input=good();
    const a=prepare(input);
    const b=prepare(input);
    expect(a).toMatchObject({
      accepted:true,
      sha256:createHash("sha256").update(input.bytes).digest("hex"),
      byteLength:input.bytes.length,
      storageCompleted:false,
      independentReviewCompleted:false,
      currencyVerified:false,
      financialPostingAllowed:false,
    });
    expect(b.accepted).toBe(true);
    if(a.accepted&&b.accepted){
      expect(a.proposedPrivateObjectKey).toMatch(
        /^b2b-credit-evidence\/seller-abc\/invoice-xyz\/[a-f0-9-]{36}\.pdf$/,
      );
      expect(a.proposedPrivateObjectKey).not.toBe(b.proposedPrivateObjectKey);
      expect(a.proposedPrivateObjectKey).not.toContain("https://");
    }
  });

  it("rejects cross-seller data or untrusted, inactive, and nonmanager users",()=>{
    const x=good();
    expect(prepare({...x,context:{...x.context,authenticatedTenantId:"buyer-abc"}}))
      .toEqual({accepted:false,reason:"WRONG_TENANT"});
    expect(prepare({...x,context:{...x.context,authenticatedRole:"STAFF"}}))
      .toEqual({accepted:false,reason:"UNTRUSTED_ACTOR"});
    expect(prepare({...x,context:{...x.context,tenantActive:false}}))
      .toEqual({accepted:false,reason:"UNTRUSTED_ACTOR"});
    expect(prepare({...x,context:{...x.context,authenticatedUserId:""}}))
      .toEqual({accepted:false,reason:"UNTRUSTED_ACTOR"});
    expect(prepare({...x,context:{...x.context,trustedInvoiceId:"../attack"}}))
      .toEqual({accepted:false,reason:"WRONG_TENANT"});
    expect(prepare({...x,context:{...x.context,authenticatedRole:"OWNER"}}).accepted)
      .toBe(true);
  });

  it("only accepts original issued/paid invoice status, never DRAFT or VOID",()=>{
    const x=good();
    for(const status of ["DRAFT","VOID","CANCELLED",""]){
      expect(prepare({...x,context:{...x.context,trustedInvoiceStatus:status}}))
        .toEqual({accepted:false,reason:"SOURCE_NOT_ISSUED"});
    }
    expect(prepare({...x,context:{...x.context,trustedInvoiceStatus:"PAID"}}).accepted)
      .toBe(true);
  });

  it("rejects deceptive filenames and supplied MIME rather than trusting file extension alone",()=>{
    const x=good();
    for(const filename of [
      "../invoice.pdf",
      "C:\\secrets\\invoice.pdf",
      "invoice.pdf.exe",
      "invoice..pdf",
      "invoice/other.pdf",
      "invoice\n.pdf",
      "",
    ]){
      expect(prepare({...x,filename}))
        .toEqual({accepted:false,reason:"INVALID_FILENAME"});
    }
    expect(prepare({...x,mimeType:"text/html"}))
      .toEqual({accepted:false,reason:"INVALID_CONTENT_TYPE"});
    expect(prepare({...x,filename:"invoice.PDF"}).accepted).toBe(true);
  });

  it("rejects fake PDF headers, spoofed magic bytes, trailing payload and invalid sizes",()=>{
    const x=good();
    for(const bytes of [
      payload("not a pdf file"),
      payload("<html><body>invoice.pdf</body></html>"),
      payload("%PDF-1.7evil\n...%%EOF"),
      payload("%PDF-3.0\n...%%EOF"),
      payload("%PDF-1.7\nfake trailer"),
      payload("%PDF-1.7\n%%EOF\n<script>bad</script>"),
      new Uint8Array(0),
      new Uint8Array(10*1024*1024+1),
    ]){
      expect(prepare({...x,bytes}))
        .toEqual({accepted:false,reason:"INVALID_DOCUMENT"});
    }
  });

  it("is metadata validation only: a plausible PDF never authenticates issuer/currency",()=>{
    const x=good();
    const fabricated=payload("%PDF-1.7\nTHIS IS AN UNTRUSTED PDF\n%%EOF");
    const result=prepare({...x,bytes:fabricated,filename:"JPY-invoice.pdf"});
    expect(result.accepted).toBe(true);
    if(result.accepted){
      expect(result.currencyVerified).toBe(false);
      expect(result.independentReviewCompleted).toBe(false);
      expect(result.storageCompleted).toBe(false);
      expect(result.financialPostingAllowed).toBe(false);
    }
  });
});
