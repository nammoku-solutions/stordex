/**
 * Prepare a seller-authorized original invoice PDF for future private storage.
 *
 * No object upload, evidence row, metadata persistence, document authenticity
 * proof, independent reviewer action or CreditNote approval is implemented.
 * Call ONLY after authentication and server-trusted invoice/tenant lookup.
 * Metadata never grants a financial action. PDF header/EOF is NOT malware
 * inspection or proof of genuine JPY invoice content.
 */
import { createHash, randomUUID } from "node:crypto";

const MAX_BYTES=10*1024*1024;
const idPattern=/^[A-Za-z0-9_-]{3,128}$/;
const acceptedMime="application/pdf";
const hasPath=(s:string):boolean =>
  s.includes("/") || s.includes("\\") || s.includes("..") || /[\x00-\x1f\x7f]/.test(s);

export type OriginalInvoiceUploadContext=Readonly<{
  authenticatedUserId:string;
  authenticatedTenantId:string;
  authenticatedRole:string;
  tenantActive:boolean;
  trustedInvoiceId:string;
  trustedInvoiceSellerTenantId:string;
  trustedInvoiceStatus:string;
}>;

export type OriginalInvoiceUploadDecision=
  | Readonly<{accepted:false;reason:
    "UNTRUSTED_ACTOR" | "WRONG_TENANT" | "SOURCE_NOT_ISSUED" |
    "INVALID_FILENAME" | "INVALID_CONTENT_TYPE" | "INVALID_DOCUMENT" }>
  | Readonly<{
    accepted:true;
    /** A server-generated *proposed* key, not proof any private object exists. */
    proposedPrivateObjectKey:string;
    sha256:string;
    byteLength:number;
    storageCompleted:false;
    independentReviewCompleted:false;
    currencyVerified:false;
    financialPostingAllowed:false;
  }>;

const refuse=(reason:Extract<OriginalInvoiceUploadDecision,{accepted:false}>["reason"]):
  OriginalInvoiceUploadDecision=>({accepted:false,reason});

function looksLikePdf(bytes:Uint8Array):boolean {
  if(bytes.length<16 || bytes.length>MAX_BYTES) return false;
  const start=Buffer.from(bytes.subarray(0,10)).toString("ascii");
  if(!/^%PDF-(?:1\.[0-7]|2\.0)\r?\n/.test(start))return false;
  // A PDF can contain arbitrary binary content before its EOF marker.
  // Only allow ASCII whitespace after the final %%EOF marker.
  const tail=Buffer.from(bytes.subarray(Math.max(0,bytes.length-2048)))
    .toString("latin1");
  return /%%EOF[ \t\r\n]*$/.test(tail);
}

export function prepareOriginalInvoiceForPrivateStorage(
  input:Readonly<{
    context:OriginalInvoiceUploadContext;
    filename:string;
    mimeType:string;
    bytes:Uint8Array;
  }>,
):OriginalInvoiceUploadDecision {
  const {context,filename,mimeType,bytes}=input;
  if(!context || !idPattern.test(context.authenticatedUserId) ||
     !idPattern.test(context.authenticatedTenantId) ||
     !["OWNER","ADMIN"].includes(context.authenticatedRole) ||
     context.tenantActive!==true) return refuse("UNTRUSTED_ACTOR");
  if(!idPattern.test(context.trustedInvoiceId) ||
     !idPattern.test(context.trustedInvoiceSellerTenantId) ||
     context.authenticatedTenantId!==context.trustedInvoiceSellerTenantId) {
    return refuse("WRONG_TENANT");
  }
  if(!["ISSUED","PAID"].includes(context.trustedInvoiceStatus)) {
    return refuse("SOURCE_NOT_ISSUED");
  }
  if(typeof filename!=="string" || filename.length<5 ||
     filename.length>120 || hasPath(filename) ||
     !/^[^\r\n]+\.pdf$/i.test(filename)) return refuse("INVALID_FILENAME");
  if(mimeType!==acceptedMime) return refuse("INVALID_CONTENT_TYPE");
  if(!(bytes instanceof Uint8Array) || !looksLikePdf(bytes)) {
    return refuse("INVALID_DOCUMENT");
  }
  const digest=createHash("sha256").update(bytes).digest("hex");
  const key=[
    "b2b-credit-evidence",
    context.trustedInvoiceSellerTenantId,
    context.trustedInvoiceId,
    randomUUID()+".pdf",
  ].join("/");
  return {
    accepted:true,
    proposedPrivateObjectKey:key,
    sha256:digest,
    byteLength:bytes.byteLength,
    storageCompleted:false,
    independentReviewCompleted:false,
    currencyVerified:false,
    financialPostingAllowed:false,
  };
}
