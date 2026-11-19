/** Internal original-document decision path. No route or feature flags are enabled. */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  lockActiveOriginalInvoiceSellerManager, lockOriginalInvoiceSource,
} from "./b2b-credit-original-document-ledger";
import { prepareIndependentOriginalInvoiceReview } from "./b2b-credit-original-document-review";
import { loadTrustedOriginalInvoiceSource } from "./b2b-credit-original-document-snapshot";
import { isValidOriginalInvoiceStorageReceipt } from "./b2b-credit-original-document-storage";

export type OriginalInvoiceDecisionInput = Readonly<{
  invoiceId: string;
  evidenceId: string;
  eventId: string;
  decision: "VERIFIED" | "REJECTED";
  reason: string;
  observation: { originalInvoiceNumber: string; explicitCurrency: string; inspectedOriginal: boolean };
  inspectedVersionId: string;
  inspectedDocumentSha256: string;
}>;
export type OriginalInvoiceRevocationInput = Readonly<{
  invoiceId: string;
  evidenceId: string;
  eventId: string;
  reason: string;
}>;
type Reviewer = Readonly<{ id: string; tenantId: string }>;
type EvidenceRow = Readonly<{
  submittedByUserId: string; sourceInvoiceNumber: string; invoiceSnapshotSha256: string;
  documentObjectRef: string; documentVersionId: string; documentByteLength: number; documentSha256: string;
}>;
type EventRow = Readonly<{
  id: string; eventId: string; eventType: string; reviewerUserId: string;
  observedDocumentSha256: string; observedInvoiceSnapshotSha256: string;
  observedCurrencyCode: string | null; reason: string;
}>;

const scopedId = /^[A-Za-z0-9_-]{3,128}$/;
const isId = (value: unknown): value is string => typeof value === "string" && scopedId.test(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = { recorded: false, reason: "REVIEW_UNAVAILABLE" } as const;

function reviewCommand(input: OriginalInvoiceRevocationInput) {
  const { invoiceId, evidenceId } = input;
  if (!isId(invoiceId) || !isId(evidenceId) ||
      typeof input.eventId !== "string" || !uuid.test(input.eventId) || typeof input.reason !== "string") return null;
  const reason = input.reason.trim();
  if (reason.length > 1000 || reason.includes("\0") || [...reason].length < 8 || [...reason].length > 500) return null;
  return { invoiceId, evidenceId, eventId: input.eventId.toLowerCase(), reason };
}

async function lockEvidence(tx: Prisma.TransactionClient, actor: Reviewer, invoiceId: string, evidenceId: string) {
  const [header] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "B2BInvoiceCurrencyEvidence" WHERE id=${evidenceId}
    AND "invoiceId"=${invoiceId} AND "sellerTenantId"=${actor.tenantId} FOR UPDATE
  `;
  return !!header;
}

async function readEvidence(tx: Prisma.TransactionClient, actor: Reviewer, invoiceId: string, evidenceId: string) {
  const [evidence] = await tx.$queryRaw<EvidenceRow[]>`
    SELECT "submittedByUserId","sourceInvoiceNumber","invoiceSnapshotSha256","documentObjectRef",
      "documentVersionId","documentByteLength","documentSha256"
    FROM "B2BInvoiceCurrencyEvidence"
    WHERE id=${evidenceId} AND "invoiceId"=${invoiceId} AND "sellerTenantId"=${actor.tenantId}
  `;
  return evidence;
}

async function readEvents(tx: Prisma.TransactionClient, actor: Reviewer, evidenceId: string) {
  return tx.$queryRaw<EventRow[]>`
    SELECT "id","eventId","eventType","reviewerUserId","observedDocumentSha256",
      "observedInvoiceSnapshotSha256","observedCurrencyCode","reason"
    FROM "B2BInvoiceCurrencyEvidenceEvent"
    WHERE "evidenceId"=${evidenceId} AND "sellerTenantId"=${actor.tenantId}
    LIMIT 3
  `;
}

async function appendEvent(
  tx: Prisma.TransactionClient, actor: Reviewer, evidence: EvidenceRow,
  command: NonNullable<ReturnType<typeof reviewCommand>>,
  decision: OriginalInvoiceDecisionInput["decision"] | "REVOKED",
) {
  const { evidenceId, eventId, reason } = command;
  const currency = decision === "VERIFIED" ? "JPY" : null;
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "B2BInvoiceCurrencyEvidenceEvent"
      ("id","evidenceId","sellerTenantId","eventId","eventType","reviewerUserId",
      "observedDocumentSha256","observedCurrencyCode","observedInvoiceSnapshotSha256","reason")
    VALUES (${"evidence-event-" + eventId},${evidenceId},${actor.tenantId},${eventId},${decision},${actor.id},
      ${evidence.documentSha256},${currency},${evidence.invoiceSnapshotSha256},${reason})
    ON CONFLICT DO NOTHING RETURNING id
  `;
  return row;
}

type ReviewerDependencies = Readonly<{
  db: Pick<PrismaClient, "$transaction">;
  requireReviewer: () => Promise<Reviewer>;
}>;

function bindReceipt(actor: Reviewer, request: OriginalInvoiceDecisionInput, evidence: EvidenceRow) {
  return {
    sellerTenantId: actor.tenantId, invoiceId: request.invoiceId,
    key: evidence.documentObjectRef, versionId: evidence.documentVersionId,
    byteLength: evidence.documentByteLength, sha256: evidence.documentSha256,
  };
}

/**
 * Actor must come from an authenticated session in trusted server code.
 * Request data never decides seller scope, evidence key, verified currency,
 * or source hash. The reviewer attests to what they saw. This code does not
 * parse a PDF or infer currency automatically.
 */
export function createOriginalInvoiceDecisionRecorder(dependencies: ReviewerDependencies & Readonly<{
  readStoredVersion: Parameters<typeof prepareIndependentOriginalInvoiceReview>[1];
}>) {
  const { db, requireReviewer, readStoredVersion } = dependencies;
  return async (input: OriginalInvoiceDecisionInput) => {
    const command = reviewCommand(input);
    if (!command) return unavailable;
    const request = { ...input, ...command, observation: { ...input.observation } };
    const { invoiceId, evidenceId, eventId, observation, decision, reason } = request;
    const currency = decision === "VERIFIED" ? "JPY" : null;
    if ((decision !== "VERIFIED" && decision !== "REJECTED") || observation.inspectedOriginal !== true ||
        typeof request.inspectedDocumentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(request.inspectedDocumentSha256) ||
        typeof request.inspectedVersionId !== "string" || request.inspectedVersionId.length > 1024) return unavailable;
    const authenticated = await requireReviewer();
    const actor = { id: authenticated.id, tenantId: authenticated.tenantId };
    if (!isId(actor.id) || !isId(actor.tenantId)) return unavailable;

    const matchesReplay = (event: EventRow, evidence: EvidenceRow) =>
      event.eventId === eventId && event.eventType === decision && event.reviewerUserId === actor.id &&
      event.observedDocumentSha256 === evidence.documentSha256 &&
      event.observedInvoiceSnapshotSha256 === evidence.invoiceSnapshotSha256 &&
      event.observedCurrencyCode === currency && event.reason === reason;
    const recorded = (id: string, replayed: boolean) =>
      ({ recorded: true, decisionEventId: id, decision, replayed, financialPostingAllowed: false } as const);

    const prepared = await db.$transaction(async tx => {
      const trusted = await loadTrustedOriginalInvoiceSource(tx, actor, invoiceId);
      if (!trusted.accepted) return null;
      const evidence = await readEvidence(tx, actor, invoiceId, evidenceId);
      if (!evidence || evidence.submittedByUserId === actor.id ||
          evidence.sourceInvoiceNumber !== trusted.source.invoice.invoiceNumber ||
          evidence.invoiceSnapshotSha256 !== trusted.source.snapshotSha256) return null;
      const events = await readEvents(tx, actor, evidenceId);
      if (events.length && (events.length !== 1 || !matchesReplay(events[0], evidence))) return null;
      return { evidence, source: trusted.source };
    }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
    if (!prepared) return unavailable;

    const receipt = bindReceipt(actor, request, prepared.evidence);
    if (!isValidOriginalInvoiceStorageReceipt(receipt) || receipt.versionId !== request.inspectedVersionId ||
        receipt.sha256 !== request.inspectedDocumentSha256) return { recorded: false, reason: "OBSERVATION_MISMATCH" } as const;
    // Fetch and hash bytes outside DB locks. The writer below reauthorizes and
    // rechecks the exact evidence pointer and canonical source before commit.
    const proof = await prepareIndependentOriginalInvoiceReview({
      reviewer: { userId: actor.id, sellerTenantId: actor.tenantId, role: prepared.source.actor.role, tenantActive: true },
      invoice: {
        ...prepared.source.invoice, sellerTenantId: actor.tenantId, snapshotSha256: prepared.source.snapshotSha256,
      },
      submission: { ...prepared.evidence, receipt },
      observation,
    }, readStoredVersion, decision);
    if (!proof.ready) return { recorded: false, reason: proof.reason } as const;

    return db.$transaction(async tx => {
      if (!await lockOriginalInvoiceSource(tx, actor.id, actor.tenantId, invoiceId)) return unavailable;
      const trusted = await loadTrustedOriginalInvoiceSource(tx, actor, invoiceId);
      if (!trusted.accepted || trusted.source.snapshotSha256 !== proof.observedInvoiceSnapshotSha256 ||
          trusted.source.invoice.invoiceNumber !== prepared.evidence.sourceInvoiceNumber) return unavailable;
      if (!await lockEvidence(tx, actor, invoiceId, evidenceId)) return unavailable;
      const evidence = await readEvidence(tx, actor, invoiceId, evidenceId);
      if (!evidence || evidence.submittedByUserId === actor.id ||
          evidence.submittedByUserId !== prepared.evidence.submittedByUserId ||
          evidence.sourceInvoiceNumber !== prepared.evidence.sourceInvoiceNumber ||
          evidence.invoiceSnapshotSha256 !== proof.observedInvoiceSnapshotSha256 ||
          evidence.documentObjectRef !== receipt.key || evidence.documentVersionId !== receipt.versionId ||
          evidence.documentByteLength !== receipt.byteLength || evidence.documentSha256 !== proof.observedDocumentSha256) return unavailable;

      const events = await readEvents(tx, actor, evidenceId);
      if (events.length) {
        return events.length === 1 && matchesReplay(events[0], evidence) ? recorded(events[0].id, true) : unavailable;
      }
      const row = await appendEvent(tx, actor, evidence, command, decision);
      return row ? recorded(row.id, false) : unavailable;
    }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
  };
}

/**
 * Revocation is a safety action on immutable history. It must still work when
 * the original invoice has changed or the PDF store is unreachable. No S3
 * call, invoice mutation, historical event update or financial action.
 */
export function createOriginalInvoiceRevocationRecorder({ db, requireReviewer }: ReviewerDependencies) {
  return async (input: OriginalInvoiceRevocationInput) => {
    const command = reviewCommand(input);
    if (!command) return unavailable;
    const { invoiceId, evidenceId, eventId, reason } = command;
    const authenticated = await requireReviewer();
    const actor = { id: authenticated.id, tenantId: authenticated.tenantId };
    if (!isId(actor.id) || !isId(actor.tenantId)) return unavailable;
    const recorded = (id: string, replayed: boolean) => ({
      recorded: true, decisionEventId: id, decision: "REVOKED", replayed, financialPostingAllowed: false,
    } as const);

    return db.$transaction(async tx => {
      if (!await lockActiveOriginalInvoiceSellerManager(tx, actor.id, actor.tenantId) ||
          !await lockEvidence(tx, actor, invoiceId, evidenceId)) return unavailable;
      const evidence = await readEvidence(tx, actor, invoiceId, evidenceId);
      if (!evidence || evidence.submittedByUserId === actor.id) return unavailable;
      const events = await readEvents(tx, actor, evidenceId);
      const verification = events.find(event => event.eventType === "VERIFIED");
      const revocation = events.find(event => event.eventType === "REVOKED");
      const sameEvidence = (event: EventRow) =>
        event.observedDocumentSha256 === evidence.documentSha256 &&
        event.observedInvoiceSnapshotSha256 === evidence.invoiceSnapshotSha256;
      if (!verification || events.length !== (revocation ? 2 : 1) ||
          verification.observedCurrencyCode !== "JPY" || !sameEvidence(verification)) return unavailable;
      if (revocation) {
        return revocation.eventId === eventId && revocation.reviewerUserId === actor.id &&
          revocation.observedCurrencyCode === null && revocation.reason === reason && sameEvidence(revocation)
          ? recorded(revocation.id, true) : unavailable;
      }
      const row = await appendEvent(tx, actor, evidence, command, "REVOKED");
      return row ? recorded(row.id, false) : unavailable;
    }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
  };
}
