/**
 * Internal intake orchestration only. No route, concrete scanner, configured
 * bucket, or database writer is registered here. Only server code may inject
 * the inspector and private storage adapter.
 */
import { createHash } from "node:crypto";
import { prepareAuthenticatedOriginalInvoiceDocument } from "./b2b-credit-original-document-source";
import {
  isValidOriginalInvoiceStorageReceipt,
  MAX_ORIGINAL_INVOICE_PDF_BYTES,
  type createOriginalInvoicePrivateStorage,
} from "./b2b-credit-original-document-storage";

type Input = Parameters<typeof prepareAuthenticatedOriginalInvoiceDocument>[0];
type PrivateStorage = Pick<ReturnType<typeof createOriginalInvoicePrivateStorage>, "put">;
type Inspection =
  | Readonly<{ verdict: "CLEAN"; inspectedSha256: string }>
  | Readonly<{ verdict: "BLOCKED" | "UNAVAILABLE" }>;

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function storeInspectedOriginalInvoice(
  input: Input,
  dependencies: Readonly<{
    inspectPdf: (bytes: Uint8Array) => Promise<Inspection>;
    storage: PrivateStorage;
  }>,
) {
  if (!(input.bytes instanceof Uint8Array) ||
      input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_ORIGINAL_INVOICE_PDF_BYTES) {
    return { stored: false, reason: "INVALID_DOCUMENT" } as const;
  }
  // Capture the request once. The inspector receives a separate copy and cannot
  // change the captured bytes that are eventually handed to storage.
  const request = {
    invoiceId: input.invoiceId, filename: input.filename, mimeType: input.mimeType,
    bytes: Buffer.from(input.bytes),
  };
  const before = await prepareAuthenticatedOriginalInvoiceDocument(request);
  if (!before.accepted) return { stored: false, reason: before.reason } as const;
  const inspected = Buffer.from(request.bytes);
  try {
    const result = await dependencies.inspectPdf(inspected);
    if (result?.verdict !== "CLEAN" || result.inspectedSha256 !== before.sha256 ||
        sha256(inspected) !== before.sha256) {
      return { stored: false, reason: "INSPECTION_NOT_CLEARED" } as const;
    }
  } catch {
    return { stored: false, reason: "INSPECTION_NOT_CLEARED" } as const;
  }

  // Revalidate session membership and the whole invoice fingerprint after the
  // external inspection. The future ledger writer still has to recheck both
  // inside its final transaction, after external storage I/O.
  const after = await prepareAuthenticatedOriginalInvoiceDocument(request);
  if (!after.accepted ||
      after.sourceSnapshotSha256 !== before.sourceSnapshotSha256 ||
      after.invoiceId !== before.invoiceId || after.sellerTenantId !== before.sellerTenantId ||
      after.submittedByUserId !== before.submittedByUserId ||
      after.sourceInvoiceNumber !== before.sourceInvoiceNumber ||
      after.sha256 !== before.sha256 || after.byteLength !== before.byteLength ||
      sha256(request.bytes) !== after.sha256) {
    return { stored: false, reason: "SOURCE_CHANGED" } as const;
  }

  const identity = {
    sellerTenantId: after.sellerTenantId, invoiceId: after.invoiceId,
    key: after.proposedPrivateObjectKey, sha256: after.sha256, byteLength: after.byteLength,
  };
  try {
    const receipt = await dependencies.storage.put({ ...identity }, request.bytes);
    if (!receipt || !isValidOriginalInvoiceStorageReceipt(receipt) ||
        receipt.sellerTenantId !== identity.sellerTenantId || receipt.invoiceId !== identity.invoiceId ||
        receipt.key !== identity.key || receipt.sha256 !== identity.sha256 || receipt.byteLength !== identity.byteLength) {
      return { stored: false, reason: "STORAGE_UNCONFIRMED" } as const;
    }
    return {
      stored: true,
      submission: {
        receipt: { ...identity, versionId: receipt.versionId },
        sourceInvoiceNumber: after.sourceInvoiceNumber,
        submittedByUserId: after.submittedByUserId,
        invoiceSnapshotSha256: after.sourceSnapshotSha256,
      },
      evidenceRecorded: false,
      currencyVerified: false,
      financialPostingAllowed: false,
    } as const;
  } catch {
    // An ambiguous or failed write is never a durable evidence submission.
    // Do not delete or retry the object here. A future executor must reconcile.
    return { stored: false, reason: "STORAGE_UNCONFIRMED" } as const;
  }
}
