/** Private review attachment response for a future authenticated route. Not registered in Next.js. */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { lockOriginalInvoiceSource } from "./b2b-credit-original-document-ledger";
import {
  isEvidenceReviewPending, isEvidenceScopedId, lockEvidence, readReviewableEvidence, type Reviewer,
} from "./b2b-credit-original-document-review-access";
import { loadTrustedOriginalInvoiceSource } from "./b2b-credit-original-document-snapshot";
import type { createOriginalInvoicePrivateStorage } from "./b2b-credit-original-document-storage";
import { compareOriginalInvoiceBytesToTrustedDigest } from "./b2b-credit-source-integrity";

export type OriginalInvoiceReviewDownloadInput = Readonly<{ invoiceId: string; evidenceId: string }>;
type ReadStoredVersion = ReturnType<typeof createOriginalInvoicePrivateStorage>["read"];

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
};
const unavailable = () => ({
  available: false,
  response: new Response(null, { status: 404, headers: privateHeaders }),
} as const);

/**
 * Fetch exactly the version selected by the ledger, without a public link
 * or a caller-provided key, tenant or version. Attachment is intentionally
 * not embedded under the app origin. A download does not certify that the
 * reviewer read it or wrote a decision.
 */
export function createOriginalInvoiceReviewDownloader(dependencies: Readonly<{
  db: Pick<PrismaClient, "$transaction">;
  readReviewer: () => Promise<Reviewer | null>;
  readStoredVersion: ReadStoredVersion;
}>) {
  const { db, readReviewer, readStoredVersion } = dependencies;
  return async ({ invoiceId, evidenceId }: OriginalInvoiceReviewDownloadInput) => {
    if (!isEvidenceScopedId(invoiceId) || !isEvidenceScopedId(evidenceId)) return unavailable();
    async function currentReviewer() {
      const actor = await readReviewer();
      return actor && isEvidenceScopedId(actor.id) && isEvidenceScopedId(actor.tenantId)
        ? { id: actor.id, tenantId: actor.tenantId } : null;
    }
    async function getCandidate(tx: Prisma.TransactionClient, actor: Reviewer) {
      const trusted = await loadTrustedOriginalInvoiceSource(tx, actor, invoiceId);
      return trusted.accepted ? readReviewableEvidence(tx, trusted.source, evidenceId) : null;
    }

    try {
      const actor = await currentReviewer();
      if (!actor) return unavailable();
      const candidate = await db.$transaction(async tx => {
        const evidence = await getCandidate(tx, actor);
        return evidence && await isEvidenceReviewPending(tx, actor, evidenceId) ? evidence : null;
      }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
      if (!candidate) return unavailable();
      const { receipt } = candidate;
      const bytes = await readStoredVersion({ invoiceId, sellerTenantId: actor.tenantId }, { ...receipt });
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== receipt.byteLength) return unavailable();
      const payload = Uint8Array.from(bytes);
      if (!compareOriginalInvoiceBytesToTrustedDigest(payload, receipt.sha256)) return unavailable();

      // Slow storage I/O is complete. Recheck session scope and pin source and
      // evidence in the same order as decision writers before disclosing bytes.
      const freshActor = await currentReviewer();
      if (!freshActor || freshActor.id !== actor.id || freshActor.tenantId !== actor.tenantId) return unavailable();
      const stillPending = await db.$transaction(async tx => {
        if (!await lockOriginalInvoiceSource(tx, actor.id, actor.tenantId, invoiceId) ||
            !await lockEvidence(tx, actor, invoiceId, evidenceId)) return false;
        const fresh = await getCandidate(tx, actor);
        if (!fresh || fresh.evidence.invoiceSnapshotSha256 !== candidate.evidence.invoiceSnapshotSha256 ||
            fresh.evidence.submittedByUserId !== candidate.evidence.submittedByUserId ||
            fresh.evidence.sourceInvoiceNumber !== candidate.evidence.sourceInvoiceNumber ||
            fresh.receipt.key !== receipt.key || fresh.receipt.versionId !== receipt.versionId ||
            fresh.receipt.byteLength !== receipt.byteLength || fresh.receipt.sha256 !== receipt.sha256) return false;
        return isEvidenceReviewPending(tx, actor, evidenceId);
      }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
      if (!stillPending) return unavailable();
      return {
        available: true,
        response: new Response(payload, { headers: {
          ...privateHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="stordex-original-invoice.pdf"',
          "Content-Length": String(payload.byteLength),
        } }),
        // Server-side handoff to future review UI. Not a URL or a permission.
        inspection: { inspectedVersionId: receipt.versionId, inspectedDocumentSha256: receipt.sha256 },
      } as const;
    } catch {
      // No provider/transaction information or partial content in a refusal.
      return unavailable();
    }
  };
}
