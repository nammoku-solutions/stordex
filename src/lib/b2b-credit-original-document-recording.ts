/**
 * Record-only retry for an already confirmed server-owned S3 receipt.
 * No live DB writer or upload route is wired. Never invoke with request data.
 */
import { createHash } from "node:crypto";
import type { storeInspectedOriginalInvoice } from "./b2b-credit-original-document-intake";
import { isValidOriginalInvoiceStorageReceipt } from "./b2b-credit-original-document-storage";

export type ConfirmedOriginalInvoice = Extract<Awaited<ReturnType<typeof storeInspectedOriginalInvoice>>, { stored: true }>;
type Stored = ConfirmedOriginalInvoice;
type Submission = Stored["submission"];
export type PendingRecord = Readonly<Submission & { evidenceId: string }>;
export type RecordAttempt =
  | Readonly<{ status: "INSERTED" | "EXISTING"; record: PendingRecord }>
  | Readonly<{ status: "SOURCE_CHANGED" | "CONFLICT" | "RETRYABLE" }>;

const id = /^[A-Za-z0-9_-]{3,128}$/;
const sha256 = /^[a-f0-9]{64}$/;
const clone = (submission: Submission): Submission => ({
  receipt: {
    sellerTenantId: submission.receipt.sellerTenantId, invoiceId: submission.receipt.invoiceId,
    key: submission.receipt.key, versionId: submission.receipt.versionId,
    sha256: submission.receipt.sha256, byteLength: submission.receipt.byteLength,
  },
  sourceInvoiceNumber: submission.sourceInvoiceNumber,
  submittedByUserId: submission.submittedByUserId,
  invoiceSnapshotSha256: submission.invoiceSnapshotSha256,
});

export function parseConfirmedOriginalInvoice(input: unknown): Stored | null {
  const stored = input as Partial<Stored> | null;
  if (stored?.stored !== true || stored.evidenceRecorded !== false || stored.currencyVerified !== false ||
      stored.financialPostingAllowed !== false || !stored.submission?.receipt) return null;
  const submission = clone(stored.submission);
  if (!isValidOriginalInvoiceStorageReceipt(submission.receipt) ||
      typeof submission.submittedByUserId !== "string" || !id.test(submission.submittedByUserId) ||
      typeof submission.invoiceSnapshotSha256 !== "string" || !sha256.test(submission.invoiceSnapshotSha256) ||
      typeof submission.sourceInvoiceNumber !== "string" ||
      submission.sourceInvoiceNumber.trim().length < 1 || submission.sourceInvoiceNumber.trim().length > 128) return null;
  return { stored: true, submission, evidenceRecorded: false, currencyVerified: false, financialPostingAllowed: false };
}

export function confirmedOriginalInvoiceEvidenceId(stored: Stored): string {
  return "evidence-" + createHash("sha256").update(JSON.stringify([
    stored.submission.receipt.key, stored.submission.receipt.versionId,
  ])).digest("hex");
}

export function sameOriginalInvoiceEvidenceRecord(candidate: PendingRecord, record: PendingRecord) {
  return record != null && record.receipt != null &&
    candidate.evidenceId === record.evidenceId &&
    candidate.sourceInvoiceNumber === record.sourceInvoiceNumber &&
    candidate.submittedByUserId === record.submittedByUserId &&
    candidate.invoiceSnapshotSha256 === record.invoiceSnapshotSha256 &&
    candidate.receipt.sellerTenantId === record.receipt.sellerTenantId &&
    candidate.receipt.invoiceId === record.receipt.invoiceId &&
    candidate.receipt.key === record.receipt.key &&
    candidate.receipt.versionId === record.receipt.versionId &&
    candidate.receipt.sha256 === record.receipt.sha256 &&
    candidate.receipt.byteLength === record.receipt.byteLength;
}

export async function recordConfirmedOriginalInvoice(
  stored: Stored,
  dependencies: Readonly<{
    /**
     * The future DB port must atomically recheck the authenticated seller and
     * source fingerprint, then insert or return the existing scoped row. Use
     * the unique object key + version constraint. Never update an existing
     * record, and never return EXISTING for a different submitter or snapshot.
     */
    recordIfCurrent: (candidate: PendingRecord) => Promise<RecordAttempt>;
  }>,
) {
  const confirmed = parseConfirmedOriginalInvoice(stored);
  if (!confirmed) return { recorded: false, reason: "INVALID_RECEIPT" } as const;
  const { submission } = confirmed;
  const evidenceId = confirmedOriginalInvoiceEvidenceId(confirmed);
  const candidate = { evidenceId, ...submission };

  // Never request another S3 PUT after a lost DB acknowledgement. The calling
  // worker can resume this operation from the same trusted stored receipt.
  for (let attempt = 0; attempt < 2; attempt++) {
    let result: RecordAttempt;
    try {
      result = await dependencies.recordIfCurrent({ evidenceId, ...clone(submission) });
    } catch {
      continue;
    }
    if (result?.status === "RETRYABLE") continue;
    if (result?.status === "SOURCE_CHANGED") return { recorded: false, reason: "SOURCE_CHANGED" } as const;
    if ((result?.status !== "INSERTED" && result?.status !== "EXISTING") ||
        !sameOriginalInvoiceEvidenceRecord(candidate, result.record)) {
      return { recorded: false, reason: "RECEIPT_CONFLICT" } as const;
    }
    return { recorded: true, evidenceId, currencyVerified: false, financialPostingAllowed: false } as const;
  }
  return { recorded: false, reason: "RECORD_UNCONFIRMED" } as const;
}
