/** Tenant-scoped reads and evidence row lock shared by private review paths. */
import type { Prisma } from "@/generated/prisma/client";
import type { TrustedSource } from "./b2b-credit-original-document-snapshot";
import { isValidOriginalInvoiceStorageReceipt } from "./b2b-credit-original-document-storage";

export type Reviewer = Readonly<{ id: string; tenantId: string }>;
export type EvidenceRow = Readonly<{
  submittedByUserId: string; sourceInvoiceNumber: string; invoiceSnapshotSha256: string;
  documentObjectRef: string; documentVersionId: string; documentByteLength: number; documentSha256: string;
}>;
export type EventRow = Readonly<{
  id: string; eventId: string; eventType: string; reviewerUserId: string;
  observedDocumentSha256: string; observedInvoiceSnapshotSha256: string;
  observedCurrencyCode: string | null; reason: string;
}>;

const scopedId = /^[A-Za-z0-9_-]{3,128}$/;
export const isEvidenceScopedId = (value: unknown): value is string => typeof value === "string" && scopedId.test(value);
export async function lockEvidence(tx: Prisma.TransactionClient, actor: Reviewer, invoiceId: string, evidenceId: string) {
  const [header] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "B2BInvoiceCurrencyEvidence" WHERE id=${evidenceId}
    AND "invoiceId"=${invoiceId} AND "sellerTenantId"=${actor.tenantId} FOR UPDATE
  `;
  return !!header;
}

export async function readEvidence(tx: Prisma.TransactionClient, actor: Reviewer, invoiceId: string, evidenceId: string) {
  const [evidence] = await tx.$queryRaw<EvidenceRow[]>`
    SELECT "submittedByUserId","sourceInvoiceNumber","invoiceSnapshotSha256","documentObjectRef",
      "documentVersionId","documentByteLength","documentSha256"
    FROM "B2BInvoiceCurrencyEvidence"
    WHERE id=${evidenceId} AND "invoiceId"=${invoiceId} AND "sellerTenantId"=${actor.tenantId}
  `;
  return evidence;
}

export async function readEvents(tx: Prisma.TransactionClient, actor: Reviewer, evidenceId: string) {
  return tx.$queryRaw<EventRow[]>`
    SELECT "id","eventId","eventType","reviewerUserId","observedDocumentSha256",
      "observedInvoiceSnapshotSha256","observedCurrencyCode","reason"
    FROM "B2BInvoiceCurrencyEvidenceEvent"
    WHERE "evidenceId"=${evidenceId} AND "sellerTenantId"=${actor.tenantId}
    LIMIT 3
  `;
}

export async function isEvidenceReviewPending(tx: Prisma.TransactionClient, actor: Reviewer, evidenceId: string) {
  const [state] = await tx.$queryRaw<{ pending: boolean }[]>`
    SELECT NOT EXISTS (
      SELECT 1 FROM "B2BInvoiceCurrencyEvidenceEvent"
      WHERE "evidenceId"=${evidenceId} AND "sellerTenantId"=${actor.tenantId}
    ) AS pending
  `;
  return state?.pending === true;
}

function bindReceipt(actor: Reviewer, invoiceId: string, evidence: EvidenceRow) {
  return {
    sellerTenantId: actor.tenantId, invoiceId,
    key: evidence.documentObjectRef, versionId: evidence.documentVersionId,
    byteLength: evidence.documentByteLength, sha256: evidence.documentSha256,
  };
}

export async function readReviewableEvidence(
  tx: Prisma.TransactionClient, source: TrustedSource, evidenceId: string,
) {
  const { actor, invoice, snapshotSha256 } = source;
  const evidence = await readEvidence(tx, actor, invoice.id, evidenceId);
  if (!evidence || !isEvidenceScopedId(evidence.submittedByUserId) ||
      evidence.submittedByUserId === actor.id || evidence.sourceInvoiceNumber !== invoice.invoiceNumber ||
      evidence.invoiceSnapshotSha256 !== snapshotSha256) return null;
  const receipt = bindReceipt(actor, invoice.id, evidence);
  return isValidOriginalInvoiceStorageReceipt(receipt) ? { evidence, receipt } : null;
}
