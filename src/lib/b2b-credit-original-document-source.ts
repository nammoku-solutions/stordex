/**
 * Server-side, read-only source preparation for future invoice PDF custody and review.
 * Do not expose this as an action or endpoint. A candidate is not evidence,
 * storage authorization, currency verification, or permission to post money.
 */
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";
import { prepareOriginalInvoiceForPrivateStorage } from "./b2b-credit-original-document-policy";
import { prepareIndependentOriginalInvoiceReview } from "./b2b-credit-original-document-review";
import { isValidOriginalInvoiceStorageReceipt } from "./b2b-credit-original-document-storage";
import { computeOriginalInvoiceFinancialFingerprint } from "./b2b-credit-source-integrity";

const ID = /^[A-Za-z0-9_-]{3,128}$/;
const isId = (value: unknown): value is string => typeof value === "string" && ID.test(value);
const MAX_ORDERS = 200;
const MAX_LINES_PER_ORDER = 500;
const reviewUnavailable = { ready: false, reason: "REVIEW_UNAVAILABLE" } as const;

type TrustedSource = Readonly<{
  actor: { id: string; tenantId: string; role: "OWNER" | "ADMIN" };
  invoice: { id: string; tenantId: string; status: "ISSUED" | "PAID"; invoiceNumber: string };
  snapshotSha256: string;
}>;

async function withTrustedInvoiceSource<T>(
  invoiceId: string,
  prepare: (tx: Prisma.TransactionClient, source: TrustedSource) => Promise<T> | T,
) {
  const { user } = await requireSession();
  if (!isId(user.id) || !isId(user.tenantId) || !isId(invoiceId)) {
    return { accepted: false, reason: "SOURCE_UNAVAILABLE" } as const;
  }

  return prisma.$transaction(async tx => {
    // Do not trust a cached JWT role. Re-read current seller membership,
    // role and tenant status in the same snapshot as the invoice source.
    const actor = await tx.user.findFirst({
      where: { id: user.id, tenantId: user.tenantId, role: { in: ["OWNER", "ADMIN"] }, tenant: { status: "ACTIVE" } },
      select: { id: true, tenantId: true, role: true },
    });
    if (!actor || actor.id !== user.id || actor.tenantId !== user.tenantId ||
        (actor.role !== "OWNER" && actor.role !== "ADMIN")) {
      return { accepted: false, reason: "SOURCE_UNAVAILABLE" } as const;
    }

    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, tenantId: actor.tenantId, status: { in: ["ISSUED", "PAID"] } },
      select: {
        id: true, tenantId: true, status: true, invoiceNumber: true, issueDate: true,
        periodYear: true, periodMonth: true, subtotal: true, tax: true, total: true,
        taxRate: true, taxPerOrder: true,
        orders: {
          take: MAX_ORDERS + 1,
          select: { order: { select: {
            id: true, tenantId: true, subtotal: true, tax: true, total: true, taxRate: true,
            items: {
              take: MAX_LINES_PER_ORDER + 1,
              select: {
                id: true, itemId: true, quantity: true, unitPrice: true, amount: true,
                item: { select: { tenantId: true } },
              },
            },
          } } },
        },
      },
    });
    // Same refusal for a missing, out-of-scope, or non-issued invoice.
    if (!invoice || invoice.id !== invoiceId || invoice.tenantId !== actor.tenantId ||
        (invoice.status !== "ISSUED" && invoice.status !== "PAID")) {
      return { accepted: false, reason: "SOURCE_UNAVAILABLE" } as const;
    }
    if (invoice.orders.length > MAX_ORDERS || invoice.orders.some(({ order }) =>
      order.tenantId !== actor.tenantId || order.items.length > MAX_LINES_PER_ORDER ||
      order.items.some(line => line.item.tenantId !== actor.tenantId))) {
      return { accepted: false, reason: "SOURCE_INTEGRITY_FAILED" } as const;
    }

    const source = computeOriginalInvoiceFinancialFingerprint({
      invoiceId: invoice.id, sellerTenantId: invoice.tenantId,
      invoiceNumber: invoice.invoiceNumber, issueDate: invoice.issueDate.toISOString(),
      periodYear: invoice.periodYear, periodMonth: invoice.periodMonth,
      subtotal: invoice.subtotal, tax: invoice.tax, total: invoice.total,
      taxRate: invoice.taxRate, taxPerOrder: invoice.taxPerOrder,
      orders: invoice.orders.map(({ order }) => ({
        orderId: order.id, sellerTenantId: order.tenantId, subtotal: order.subtotal,
        tax: order.tax, total: order.total, taxRate: order.taxRate,
        lines: order.items.map(line => ({
          lineId: line.id, itemId: line.itemId, quantity: line.quantity,
          unitPrice: line.unitPrice, amount: line.amount,
        })),
      })),
    });
    if (!source.ready) return { accepted: false, reason: "SOURCE_INTEGRITY_FAILED" } as const;
    return {
      accepted: true,
      result: await prepare(tx, {
        actor: { ...actor, role: actor.role },
        invoice: { id: invoice.id, tenantId: invoice.tenantId, status: invoice.status, invoiceNumber: invoice.invoiceNumber },
        snapshotSha256: source.snapshotSha256,
      }),
    } as const;
  }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
}

export async function prepareAuthenticatedOriginalInvoiceDocument(input: Readonly<{
  invoiceId: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}>) {
  const candidate = await withTrustedInvoiceSource(input.invoiceId, (_tx, { actor, invoice, snapshotSha256 }) => {
    const document = prepareOriginalInvoiceForPrivateStorage({
      filename: input.filename,
      mimeType: input.mimeType,
      bytes: input.bytes,
      context: {
        authenticatedUserId: actor.id,
        authenticatedTenantId: actor.tenantId,
        authenticatedRole: actor.role,
        tenantActive: true,
        trustedInvoiceId: invoice.id,
        trustedInvoiceSellerTenantId: invoice.tenantId,
        trustedInvoiceStatus: invoice.status,
      },
    });
    if (!document.accepted) return document;
    return {
      ...document, sourceSnapshotSha256: snapshotSha256, sellerTenantId: actor.tenantId, invoiceId: invoice.id,
      sourceInvoiceNumber: invoice.invoiceNumber, submittedByUserId: actor.id,
    } as const;
  });
  return candidate.accepted ? candidate.result : candidate;
}

type EvidenceIdentity = Readonly<{ evidenceId: string; invoiceId: string; sellerTenantId: string }>;
type EvidenceProjection = Readonly<{
  id: string;
  invoiceId: string;
  sellerTenantId: string;
  sourceInvoiceNumber: string;
  submittedByUserId: string;
  invoiceSnapshotSha256: string;
  documentObjectRef: string;
  documentVersionId: string;
  documentSha256: string;
  documentByteLength: number;
  /** False only when the ledger has no decision or revocation for this record. */
  hasDecision: boolean;
}>;

/**
 * Internal review preparation. Dependencies are server-owned and must not be request data.
 * The ledger query is a port until its Prisma migration is approved. No decision,
 * PDF rendering, financial state or DB writes are performed by this function.
 */
export async function prepareAuthenticatedOriginalInvoiceReview(input: Readonly<{
  invoiceId: string;
  evidenceId: string;
  observation: { originalInvoiceNumber: string; explicitCurrency: string; inspectedOriginal: boolean };
  inspectedVersionId: string;
  inspectedDocumentSha256: string;
}>, dependencies: Readonly<{
  readEvidence: (tx: Prisma.TransactionClient, scope: EvidenceIdentity) => Promise<EvidenceProjection | null>;
  readStoredVersion: Parameters<typeof prepareIndependentOriginalInvoiceReview>[1];
}>) {
  if (!isId(input.evidenceId)) return reviewUnavailable;
  // Snapshot request fields before any awaited I/O.
  const { evidenceId, inspectedVersionId, inspectedDocumentSha256 } = input;
  const observation = { ...input.observation };
  const trusted = await withTrustedInvoiceSource(input.invoiceId, async (tx, { actor, invoice, snapshotSha256 }) => {
    const evidence = await dependencies.readEvidence(tx, {
      evidenceId, invoiceId: invoice.id, sellerTenantId: actor.tenantId,
    });
    if (!evidence || evidence.id !== evidenceId || evidence.invoiceId !== invoice.id ||
        evidence.sellerTenantId !== actor.tenantId || evidence.hasDecision !== false ||
        !isId(evidence.submittedByUserId) || evidence.submittedByUserId === actor.id ||
        evidence.sourceInvoiceNumber !== invoice.invoiceNumber ||
        evidence.invoiceSnapshotSha256 !== snapshotSha256) return null;

    const receipt = {
      sellerTenantId: actor.tenantId, invoiceId: invoice.id, key: evidence.documentObjectRef,
      versionId: evidence.documentVersionId, sha256: evidence.documentSha256, byteLength: evidence.documentByteLength,
    };
    if (!isValidOriginalInvoiceStorageReceipt(receipt)) return null;
    return {
      reviewer: { userId: actor.id, sellerTenantId: actor.tenantId, role: actor.role, tenantActive: true },
      invoice: { id: invoice.id, sellerTenantId: invoice.tenantId, invoiceNumber: invoice.invoiceNumber,
        status: invoice.status, snapshotSha256 },
      submission: {
        submittedByUserId: evidence.submittedByUserId,
        invoiceSnapshotSha256: evidence.invoiceSnapshotSha256,
        receipt,
      },
    };
  });
  if (!trusted.accepted || !trusted.result) return reviewUnavailable;
  if (trusted.result.submission.receipt.versionId !== inspectedVersionId ||
      trusted.result.submission.receipt.sha256 !== inspectedDocumentSha256) {
    return { ready: false, reason: "OBSERVATION_MISMATCH" } as const;
  }
  // Avoid running S3 requests inside the Prisma transaction. A future event
  // writer must recheck authorization, source hash and evidence in its own tx.
  return prepareIndependentOriginalInvoiceReview({ ...trusted.result, observation }, dependencies.readStoredVersion);
}
