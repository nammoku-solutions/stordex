/**
 * Pure, non-persistent Invoice currency-evidence policy.
 *
 * A browser "JPY" checkbox is NEVER valid evidence. An actual original
 * issued-invoice document and a trusted invoice snapshot need independent,
 * persisted attestation in a future (separately approved) schema.
 *
 * This module does NOT read files, verify signatures, authenticate users,
 * create evidence or authorize issuing money. Callers must independently
 * authenticate the verifier, inspect the original document and recompute
 * the trusted snapshot hash server-side.
 */
export type CurrencyEvidenceBlocker =
  | "INVOICE_NOT_ELIGIBLE"
  | "MISSING_EVIDENCE"
  | "INVALID_DOCUMENT"
  | "CURRENCY_MISMATCH"
  | "EVIDENCE_NOT_VERIFIED"
  | "WRONG_SELLER_OR_INVOICE"
  | "UNTRUSTED_INVOICE_SNAPSHOT"
  | "SELF_VERIFICATION"
  | "INVALID_VERIFIER"
  | "INVALID_EVIDENCE_TIMESTAMPS";

export type EvidenceReview = Readonly<{
  documentKind: "ORIGINAL_ISSUED_INVOICE";
  documentSha256: string;
  documentExplicitCurrency: string;
  invoiceId: string;
  sellerTenantId: string;
  invoiceSnapshotSha256: string;
  submittedByUserId: string;
  submittedAt: string;
  reviewedByUserId: string | null;
  reviewedBySellerTenantId: string | null;
  reviewerRole: string | null;
  reviewerActive: boolean;
  reviewedAt: string | null;
  reviewMethod: "INDEPENDENT_ORIGINAL_DOCUMENT_INSPECTION" | "NONE";
  status: "PENDING" | "VERIFIED" | "REJECTED" | "REVOKED";
}>;

export type InvoiceCurrencyEvidenceInput = Readonly<{
  invoiceId: string;
  sellerTenantId: string;
  invoiceStatus: string;
  /** Recomputed from the current authoritative invoice and linked orders. */
  trustedInvoiceSnapshotSha256: string;
  /** Has an independently authenticated reviewer inspected the document? */
  review: EvidenceReview | null;
}>;

export type InvoiceCurrencyEvidenceAssessment =
  | Readonly<{ currencyVerified: false; blocker: CurrencyEvidenceBlocker }>
  | Readonly<{
      currencyVerified: true;
      currencyCode: "JPY";
      documentSha256: string;
      invoiceSnapshotSha256: string;
      reviewerUserId: string;
      /** Preview/approval design only: a successful evidence check is not a posting license. */
      financialPostingAllowed: false;
    }>;

const sha256 = (x: string): boolean => /^[0-9a-f]{64}$/i.test(x);
const validId = (x: string): boolean => typeof x === "string" && x.length > 0 && x.length <= 128;

function validTimestamp(s: string | null): number | null {
  if (typeof s !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s)) {
    return null;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 19) === s.slice(0, 19)
    ? t : null;
}

export function assessInvoiceCurrencyEvidence(
  input: InvoiceCurrencyEvidenceInput,
): InvoiceCurrencyEvidenceAssessment {
  if (!validId(input.invoiceId) || !validId(input.sellerTenantId) ||
      !["ISSUED", "PAID"].includes(input.invoiceStatus)) {
    return { currencyVerified: false, blocker: "INVOICE_NOT_ELIGIBLE" };
  }
  const e = input.review;
  if (!e) return { currencyVerified: false, blocker: "MISSING_EVIDENCE" };
  if (e.documentKind !== "ORIGINAL_ISSUED_INVOICE" ||
      !sha256(e.documentSha256) ||
      !validId(e.submittedByUserId)) {
    return { currencyVerified: false, blocker: "INVALID_DOCUMENT" };
  }
  if (e.documentExplicitCurrency !== "JPY") {
    return { currencyVerified: false, blocker: "CURRENCY_MISMATCH" };
  }
  if (e.invoiceId !== input.invoiceId || e.sellerTenantId !== input.sellerTenantId ||
      e.reviewedBySellerTenantId !== input.sellerTenantId) {
    return { currencyVerified: false, blocker: "WRONG_SELLER_OR_INVOICE" };
  }
  if (!sha256(input.trustedInvoiceSnapshotSha256) ||
      !sha256(e.invoiceSnapshotSha256) ||
      e.invoiceSnapshotSha256.toLowerCase() !==
        input.trustedInvoiceSnapshotSha256.toLowerCase()) {
    return { currencyVerified: false, blocker: "UNTRUSTED_INVOICE_SNAPSHOT" };
  }
  if (e.status !== "VERIFIED" ||
      e.reviewMethod !== "INDEPENDENT_ORIGINAL_DOCUMENT_INSPECTION") {
    return { currencyVerified: false, blocker: "EVIDENCE_NOT_VERIFIED" };
  }
  if (!validId(e.reviewedByUserId ?? "") ||
      (e.reviewerRole !== "OWNER" && e.reviewerRole !== "ADMIN") ||
      e.reviewerActive !== true) {
    return { currencyVerified: false, blocker: "INVALID_VERIFIER" };
  }
  if (e.submittedByUserId === e.reviewedByUserId) {
    return { currencyVerified: false, blocker: "SELF_VERIFICATION" };
  }
  const submittedAt = validTimestamp(e.submittedAt);
  const reviewedAt = validTimestamp(e.reviewedAt);
  if (submittedAt === null || reviewedAt === null || reviewedAt < submittedAt) {
    return { currencyVerified: false, blocker: "INVALID_EVIDENCE_TIMESTAMPS" };
  }
  return {
    currencyVerified: true,
    currencyCode: "JPY",
    documentSha256: e.documentSha256.toLowerCase(),
    invoiceSnapshotSha256: input.trustedInvoiceSnapshotSha256.toLowerCase(),
    reviewerUserId: e.reviewedByUserId!,
    financialPostingAllowed: false,
  };
}
