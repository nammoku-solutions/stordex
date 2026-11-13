import { compareOriginalInvoiceBytesToTrustedDigest } from "./b2b-credit-source-integrity";
import type { OriginalInvoiceStorageReceipt } from "./b2b-credit-original-document-storage";

type ReviewInputs = Readonly<{
  // These three records must be loaded server-side. Only the observation is entered by the reviewer.
  reviewer: { userId: string; sellerTenantId: string; role: string; tenantActive: boolean };
  invoice: { id: string; sellerTenantId: string; invoiceNumber: string; status: string; snapshotSha256: string };
  submission: {
    submittedByUserId: string;
    invoiceSnapshotSha256: string;
    receipt: OriginalInvoiceStorageReceipt;
  };
  observation: { originalInvoiceNumber: string; explicitCurrency: string; inspectedOriginal: boolean };
}>;

const sha256 = /^[a-f0-9]{64}$/;

function sourceAndReviewerMatch(input: ReviewInputs): boolean {
  const { reviewer, invoice, submission } = input;
  return reviewer.tenantActive === true &&
    (reviewer.role === "OWNER" || reviewer.role === "ADMIN") &&
    Boolean(reviewer.userId && submission.submittedByUserId) &&
    reviewer.userId !== submission.submittedByUserId &&
    Boolean(invoice.id && invoice.sellerTenantId && invoice.invoiceNumber) &&
    reviewer.sellerTenantId === invoice.sellerTenantId &&
    (invoice.status === "ISSUED" || invoice.status === "PAID") &&
    submission.receipt.invoiceId === invoice.id &&
    submission.receipt.sellerTenantId === invoice.sellerTenantId &&
    sha256.test(invoice.snapshotSha256) &&
    submission.invoiceSnapshotSha256 === invoice.snapshotSha256;
}

/**
 * Preflight only. No verification event is written. The future writer must
 * authorize the reviewer and recheck current source/evidence state in its transaction.
 * The reader must fetch the exact version through the trusted private store.
 */
export async function prepareIndependentOriginalInvoiceReview(
  input: ReviewInputs,
  readStoredVersion: (scope: { sellerTenantId: string; invoiceId: string }, receipt: OriginalInvoiceStorageReceipt) => Promise<Uint8Array>,
) {
  const { invoice, submission, observation } = input;
  if (!sourceAndReviewerMatch(input)) return { ready: false, reason: "REVIEW_UNAVAILABLE" } as const;
  if (observation.inspectedOriginal !== true || observation.explicitCurrency !== "JPY" ||
      observation.originalInvoiceNumber !== invoice.invoiceNumber) {
    return { ready: false, reason: "OBSERVATION_MISMATCH" } as const;
  }
  try {
    const bytes = await readStoredVersion({ sellerTenantId: invoice.sellerTenantId, invoiceId: invoice.id }, submission.receipt);
    if (bytes.byteLength !== submission.receipt.byteLength ||
        !compareOriginalInvoiceBytesToTrustedDigest(bytes, submission.receipt.sha256)) {
      return { ready: false, reason: "DOCUMENT_UNAVAILABLE" } as const;
    }
  } catch {
    return { ready: false, reason: "DOCUMENT_UNAVAILABLE" } as const;
  }
  return {
    ready: true,
    observedDocumentSha256: submission.receipt.sha256,
    observedInvoiceSnapshotSha256: invoice.snapshotSha256,
    reviewRecorded: false,
    currencyVerified: false,
    financialPostingAllowed: false,
  } as const;
}
