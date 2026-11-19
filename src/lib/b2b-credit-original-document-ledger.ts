/**
 * Internal record-only adapter for a server-owned confirmed receipt.
 * No route, session lookup, worker binding, financial write or migration.
 * Do not accept a request's actor, scope, digest, or storage receipt here.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  confirmedOriginalInvoiceEvidenceId, parseConfirmedOriginalInvoice, sameOriginalInvoiceEvidenceRecord,
  type PendingRecord, type RecordAttempt,
} from "./b2b-credit-original-document-recording";
import {
  loadTrustedOriginalInvoiceSource, MAX_LINES_PER_ORDER, MAX_ORDERS,
} from "./b2b-credit-original-document-snapshot";

async function lockSource(
  tx: Prisma.TransactionClient, actor: string, seller: string, invoice: string,
): Promise<boolean> {
  const membership = await tx.$queryRaw<{ id: string }[]>`
    SELECT u.id FROM "User" u JOIN "Tenant" t ON t.id=u."tenantId"
    WHERE u.id=${actor} AND t.id=${seller} AND u.role IN ('OWNER','ADMIN') AND t.status='ACTIVE'
    FOR SHARE OF u,t
  `;
  if (membership.length !== 1) return false;
  const headers = await tx.$queryRaw<{ id: string }[]>`
    SELECT i.id FROM "Invoice" i WHERE i.id=${invoice} AND i."tenantId"=${seller}
    AND i.status IN ('ISSUED','PAID') FOR UPDATE OF i
  `;
  if (headers.length !== 1) return false;
  // Invoices and Orders are FK parents. UPDATE-strength locks block incoming
  // invoice links and order lines, while SHARE locks pin existing edges/lines
  // and item ownership. Separate READ COMMITTED statements see changes that
  // committed while we waited, including writes by other isolation levels.
  const orders = await tx.$queryRaw<{ id: string; tenantId: string }[]>`
    SELECT o.id, o."tenantId" FROM "InvoiceOrder" io JOIN "Order" o ON o.id=io."orderId"
    WHERE io."invoiceId"=${invoice} ORDER BY o.id LIMIT ${MAX_ORDERS + 1}
    FOR SHARE OF io FOR UPDATE OF o
  `;
  if (!orders.length || orders.length > MAX_ORDERS || orders.some(order => order.tenantId !== seller)) return false;
  const lines = await tx.$queryRaw<{ orderId: string; itemTenantId: string }[]>`
    SELECT io."orderId", owned."itemTenantId"
    FROM "InvoiceOrder" io
    CROSS JOIN LATERAL (
      SELECT i."tenantId" AS "itemTenantId"
      FROM "OrderItem" li JOIN "Item" i ON i.id=li."itemId"
      WHERE li."orderId"=io."orderId" ORDER BY li.id LIMIT ${MAX_LINES_PER_ORDER + 1}
      FOR SHARE OF li,i
    ) owned
    WHERE io."invoiceId"=${invoice}
  `;
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (line.itemTenantId !== seller) return false;
    counts.set(line.orderId, (counts.get(line.orderId) ?? 0) + 1);
  }
  return orders.every(order => {
    const count = counts.get(order.id);
    return !!count && count <= MAX_LINES_PER_ORDER;
  });
}

type EvidenceRow = {
  id: string; sellerTenantId: string; invoiceId: string; sourceInvoiceNumber: string;
  documentObjectRef: string; documentVersionId: string; documentByteLength: number;
  documentSha256: string; invoiceSnapshotSha256: string; submittedByUserId: string;
};

export function createOriginalInvoiceLedgerRecorder(db: Pick<PrismaClient, "$transaction">) {
  return {
    async recordIfCurrent(input: PendingRecord): Promise<RecordAttempt> {
      const confirmed = parseConfirmedOriginalInvoice({
        stored: true, evidenceRecorded: false, currencyVerified: false, financialPostingAllowed: false, submission: input,
      });
      if (!confirmed || input.evidenceId !== confirmedOriginalInvoiceEvidenceId(confirmed)) return { status: "CONFLICT" };
      const candidate = { evidenceId: input.evidenceId, ...confirmed.submission };
      const { evidenceId, receipt, submittedByUserId, invoiceSnapshotSha256, sourceInvoiceNumber } = candidate;
      const { sellerTenantId, invoiceId, key, versionId, sha256, byteLength } = receipt;
      return db.$transaction(async (tx): Promise<RecordAttempt> => {
        if (!await lockSource(tx, submittedByUserId, sellerTenantId, invoiceId)) return { status: "SOURCE_CHANGED" };
        const check = await loadTrustedOriginalInvoiceSource(tx, { id: submittedByUserId, tenantId: sellerTenantId }, invoiceId);
        if (!check.accepted || check.source.snapshotSha256 !== invoiceSnapshotSha256 ||
            check.source.invoice.invoiceNumber !== sourceInvoiceNumber) return { status: "SOURCE_CHANGED" };
        // Migration 12 is still unapproved. Explicit, parameterized SQL keeps
        // this adapter independent of the committed generated Prisma models.
        const inserted = await tx.$executeRaw`
          INSERT INTO "B2BInvoiceCurrencyEvidence"
            ("id","sellerTenantId","invoiceId","sourceInvoiceNumber","documentObjectRef","documentVersionId",
            "documentByteLength","documentSha256","invoiceSnapshotSha256","submittedByUserId")
          VALUES (${evidenceId},${sellerTenantId},${invoiceId},${sourceInvoiceNumber},${key},${versionId},
            ${byteLength},${sha256},${invoiceSnapshotSha256},${submittedByUserId})
          ON CONFLICT DO NOTHING
        `;
        const [row] = await tx.$queryRaw<EvidenceRow[]>`
          SELECT "id","sellerTenantId","invoiceId","sourceInvoiceNumber","documentObjectRef","documentVersionId",
            "documentByteLength","documentSha256","invoiceSnapshotSha256","submittedByUserId"
          FROM "B2BInvoiceCurrencyEvidence"
          WHERE "sellerTenantId"=${sellerTenantId} AND "invoiceId"=${invoiceId}
          AND "documentObjectRef"=${key} AND "documentVersionId"=${versionId}
        `;
        if (!row) return { status: "CONFLICT" };
        const record = {
          evidenceId: row.id, sourceInvoiceNumber: row.sourceInvoiceNumber, submittedByUserId: row.submittedByUserId,
          invoiceSnapshotSha256: row.invoiceSnapshotSha256, receipt: {
            sellerTenantId: row.sellerTenantId, invoiceId: row.invoiceId, key: row.documentObjectRef,
            versionId: row.documentVersionId, sha256: row.documentSha256, byteLength: row.documentByteLength,
          },
        };
        if (!sameOriginalInvoiceEvidenceRecord(candidate, record)) return { status: "CONFLICT" };
        return { status: inserted === 1 ? "INSERTED" : "EXISTING", record };
      }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
    },
  };
}
