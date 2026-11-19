/** Runtime composition for a future authorized single-host Staging rehearsal. */
import { S3Client } from "@aws-sdk/client-s3";
import { lstat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { prisma } from "./db";
import { readSessionUser } from "./session";
import { evidenceUnavailable, type EvidenceSummary, type EvidenceUatHandlers } from "./b2b-credit-evidence-http";
import { createEvidenceReviewTickets } from "./b2b-credit-evidence-ticket";
import { evidenceUatEnabled } from "./b2b-credit-evidence-uat";
import { createOriginalInvoiceRecordingCheckpoint } from "./b2b-credit-original-document-checkpoint";
import { createClamdOriginalInvoiceInspector } from "./b2b-credit-original-document-clamd";
import {
  createOriginalInvoiceDecisionRecorder, createOriginalInvoiceRevocationRecorder,
} from "./b2b-credit-original-document-decision";
import { createOriginalInvoiceReviewDownloader } from "./b2b-credit-original-document-download";
import { storeInspectedOriginalInvoice } from "./b2b-credit-original-document-intake";
import { createOriginalInvoiceLedgerRecorder } from "./b2b-credit-original-document-ledger";
import { loadTrustedOriginalInvoiceSource } from "./b2b-credit-original-document-snapshot";
import { createOriginalInvoicePrivateStorage } from "./b2b-credit-original-document-storage";

const nonProdAccount = "262741079258";
const region = "ap-northeast-1";
const s3 = new S3Client({ region, maxAttempts: 1 });

async function expectedStagingDatabase() {
  const [db] = await prisma.$queryRaw<{ project: string; branch: string; database: string; ready: boolean }[]>`
    SELECT current_setting('neon.project_id', true) AS project,
      current_setting('neon.branch_id', true) AS branch, current_database() AS database,
      to_regclass('public."B2BInvoiceCurrencyEvidence"') IS NOT NULL AND
      to_regclass('public."B2BInvoiceCurrencyEvidenceEvent"') IS NOT NULL AND
      to_regclass('public."B2BCreditApprovalReviewEvent"') IS NOT NULL AS ready
  `;
  return db?.project === "dry-feather-14704968" && db.branch === "br-sparkling-boat-ao9nrctp" &&
    db.database === "neondb" && db.ready === true;
}

export async function initializeEvidenceUat(): Promise<EvidenceUatHandlers | null> {
  if (!evidenceUatEnabled()) return null;
  const env = process.env;
  const bucket = env.STORDEX_EVIDENCE_UAT_BUCKET;
  const kmsKeyArn = env.STORDEX_EVIDENCE_UAT_KMS_KEY_ARN;
  const socketPath = env.STORDEX_EVIDENCE_UAT_CLAMD_SOCKET;
  const checkpointDir = env.STORDEX_EVIDENCE_UAT_CHECKPOINT_DIR;
  const ticketKey = env.STORDEX_EVIDENCE_UAT_TICKET_KEY;
  if (!bucket || bucket.startsWith("stordex-evidence-sandbox-") ||
      !kmsKeyArn?.startsWith(`arn:aws:kms:${region}:${nonProdAccount}:key/`) ||
      !ticketKey || !/^[A-Za-z0-9_-]{43}$/.test(ticketKey)) return null;
  const user = await readSessionUser();
  if (!user) return null;
  // Require fresh role and DB identity before accepting the request body.
  if (!await expectedStagingDatabase() || !await prisma.user.findFirst({
    where: { id: user.id, tenantId: user.tenantId, role: { in: ["OWNER", "ADMIN"] }, tenant: { status: "ACTIVE" } },
    select: { id: true },
  })) return null;
  const storage = createOriginalInvoicePrivateStorage(s3, { bucket, kmsKeyArn, expectedBucketOwner: nonProdAccount });
  const tickets = createEvidenceReviewTickets(Buffer.from(ticketKey, "base64url"));
  const forRequest = { db: prisma, requireReviewer: async () => user };
  const downloader = createOriginalInvoiceReviewDownloader({ db: prisma, readReviewer: readSessionUser, readStoredVersion: storage.read });
  const decide = createOriginalInvoiceDecisionRecorder({
    ...forRequest, readStoredVersion: storage.read, verifyReviewTicket: tickets.verify,
  });
  const revoke = createOriginalInvoiceRevocationRecorder(forRequest);
  const recorder = createOriginalInvoiceLedgerRecorder(prisma);

  return {
    async list(invoiceId) {
      return prisma.$transaction(async tx => {
        const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, tenantId: user.tenantId },
          select: { id: true, invoiceNumber: true } });
        const member = await tx.user.findFirst({
          where: { id: user.id, tenantId: user.tenantId, role: { in: ["OWNER", "ADMIN"] }, tenant: { status: "ACTIVE" } },
          select: { id: true },
        });
        if (!invoice || !member) return null;
        const source = await loadTrustedOriginalInvoiceSource(tx, user, invoiceId);
        const rows = await tx.$queryRaw<{ id: string; submittedByUserId: string; invoiceSnapshotSha256: string;
          sourceInvoiceNumber: string; verified: boolean; rejected: boolean; revoked: boolean }[]>`
          SELECT h.id,h."submittedByUserId",h."invoiceSnapshotSha256",h."sourceInvoiceNumber",
            EXISTS (SELECT 1 FROM "B2BInvoiceCurrencyEvidenceEvent" e WHERE e."evidenceId"=h.id AND
              e."sellerTenantId"=h."sellerTenantId" AND e."eventType"='VERIFIED') AS verified,
            EXISTS (SELECT 1 FROM "B2BInvoiceCurrencyEvidenceEvent" e WHERE e."evidenceId"=h.id AND
              e."sellerTenantId"=h."sellerTenantId" AND e."eventType"='REJECTED') AS rejected,
            EXISTS (SELECT 1 FROM "B2BInvoiceCurrencyEvidenceEvent" e WHERE e."evidenceId"=h.id AND
              e."sellerTenantId"=h."sellerTenantId" AND e."eventType"='REVOKED') AS revoked
          FROM "B2BInvoiceCurrencyEvidence" h
          WHERE h."sellerTenantId"=${user.tenantId} AND h."invoiceId"=${invoiceId}
          ORDER BY h."submittedAt" DESC,h.id LIMIT 20
        `;
        return rows.map((row): EvidenceSummary => {
          const current = source.accepted && source.source.snapshotSha256 === row.invoiceSnapshotSha256 &&
            invoice.invoiceNumber === row.sourceInvoiceNumber;
          return {
            id: row.id,
            state: row.revoked ? "REVOKED" : row.rejected ? "REJECTED" :
              !current ? "UNAVAILABLE" : row.verified ? "VERIFIED" : "PENDING",
            canReview: current && !row.revoked && !row.verified && !row.rejected && row.submittedByUserId !== user.id,
            canRevoke: row.verified && !row.revoked && !row.rejected && row.submittedByUserId !== user.id,
          };
        });
      }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
    },
    async upload(invoiceId, bytes) {
      let intentId: string | undefined;
      try {
        if (!socketPath || !isAbsolute(socketPath) || !checkpointDir || !isAbsolute(checkpointDir) ||
            /^\/(tmp|var\/tmp|dev\/shm)(\/|$)/.test(resolve(checkpointDir)) ||
            !(await lstat(socketPath)).isSocket()) return "REJECTED";
        const checkpoint = await createOriginalInvoiceRecordingCheckpoint(checkpointDir);
        const inspectPdf = createClamdOriginalInvoiceInspector({ socketPath });
        const stored = await storeInspectedOriginalInvoice({
          invoiceId, filename: "original-invoice.pdf", mimeType: "application/pdf", bytes,
        }, { inspectPdf, storage, saveIntent: async intent => {
          intentId = await checkpoint.saveIntent(intent);
          return intentId;
        } });
        if (!stored.stored) return stored.reason === "INTENT_UNCONFIRMED" || intentId ? "RECONCILE" : "REJECTED";
        if (!intentId) return "RECONCILE";
        const result = await checkpoint.resumeIntent(intentId, { ...recorder, storage: {
          recover: async identity => {
            const receipt = await storage.recover(identity);
            if (receipt.versionId !== stored.submission.receipt.versionId) throw new Error("Original invoice version changed");
            return receipt;
          },
        } });
        return result.recorded ? "RECORDED" : "RECONCILE";
      } catch {
        return intentId ? "RECONCILE" : "REJECTED";
      }
    },
    async download(invoiceId, evidenceId) {
      const result = await downloader({ invoiceId, evidenceId });
      if (!result.available) return result.response;
      if (result.reviewer.id !== user.id || result.reviewer.tenantId !== user.tenantId) return evidenceUnavailable();
      result.response.headers.set("x-stordex-review-ticket", tickets.issue({
        reviewerId: user.id, sellerTenantId: user.tenantId, invoiceId, evidenceId, ...result.inspection,
      }));
      return result.response;
    },
    async decide(input) { return (await decide(input)).recorded; },
    async revoke(input) { return (await revoke(input)).recorded; },
  };
}
