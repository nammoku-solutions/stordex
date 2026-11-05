/**
 * Issue #82 / Draft stack #121: prepare a credit note DRAFT only.
 *
 * There is no public route or server action importing this service.
 * It NEVER assigns money, issues a credit, edits an invoice or initiates
 * payment. CreditNote schema explicitly rejects all non-DRAFT statuses.
 */
import { prisma } from "@/lib/db";
import { lockBuyerPurchaseOrder, lockCompanyConnection } from "@/lib/b2b-locks";
import type { Prisma } from "@/generated/prisma/client";

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const MAX = 2_147_483_647;
const ALLOWED_RETURN_STATUSES = [
  "APPROVED", "PARTIALLY_APPROVED", "DISPATCHED",
  "PARTIALLY_INSPECTED", "INSPECTED", "CREDIT_PENDING",
];

export class CreditDraftServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditDraftServiceError";
  }
}
function fail(message: string): never {
  throw new CreditDraftServiceError(message);
}

type Line = { returnItemId: string; creditedQuantity: number };
function normalizedLines(lines: readonly Line[]): Line[] {
  if (lines.length < 1 || lines.length > 100) fail("調整明細は1〜100件で指定してください");
  const ids = new Set<string>();
  return lines.map(line => {
    if (!line.returnItemId?.trim() || ids.has(line.returnItemId)) {
      fail("返品明細のIDが不正、または重複しています");
    }
    ids.add(line.returnItemId);
    if (!Number.isSafeInteger(line.creditedQuantity) ||
        line.creditedQuantity <= 0 || line.creditedQuantity > MAX) {
      fail("調整数量は1〜2,147,483,647の整数で指定してください");
    }
    return { returnItemId: line.returnItemId, creditedQuantity: line.creditedQuantity };
  }).sort((a,b) => a.returnItemId.localeCompare(b.returnItemId));
}

async function requireSellerAdmin(tx: Prisma.TransactionClient, tenantId: string, userId: string) {
  const actor = await tx.user.findFirst({
    where: {
      id: userId, tenantId, role: { in: ["OWNER", "ADMIN"] },
      tenant: { status: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!actor) fail("クレジットノート下書きには売り手管理者権限が必要です");
}

/** Store only invoice identity and verified inspected-unit allocations.
 * Monetary proposals remain NULL until separately reviewed tax workflow. */
export async function createB2BCreditNoteDraft(input: {
  sellerTenantId: string;
  userId: string;
  originalInvoiceId: string;
  returnRequestId: string;
  idempotencyKey: string;
  currencyCode: string;
  lines: readonly Line[];
}): Promise<{ creditNoteId: string; created: boolean }> {
  if (!input.sellerTenantId || !input.userId || !input.originalInvoiceId ||
      !input.returnRequestId || !UUID.test(input.idempotencyKey) ||
      !CURRENCY.test(input.currencyCode)) {
    fail("企業・請求書・返品申請・通貨・再送キーを確認してください");
  }
  const lines = normalizedLines(input.lines);
  const creditNoteNumber = "CN-" + input.idempotencyKey.toLowerCase();
  return prisma.$transaction(async tx => {
    await requireSellerAdmin(tx, input.sellerTenantId, input.userId);
    const locator = await tx.b2BReturnRequest.findFirst({
      where: { id: input.returnRequestId, sellerTenantId: input.sellerTenantId },
      select: {
        id: true, companyOrder: {
          select: {
            buyerTenantId: true, purchaseOrderId: true, connectionId: true,
          },
        },
      },
    });
    if (!locator) fail("申請された返品情報が見つかりません");
    await lockBuyerPurchaseOrder(
      tx, locator.companyOrder.buyerTenantId,
      locator.companyOrder.purchaseOrderId,
    );
    await lockCompanyConnection(tx, locator.companyOrder.connectionId);
    const requestRow = await tx.$queryRaw<{ id:string }[]>`
      SELECT id FROM "B2BReturnRequest"
      WHERE id = ${locator.id} AND "sellerTenantId" = ${input.sellerTenantId}
      FOR UPDATE
    `;
    if (requestRow.length !== 1) fail("返品申請が別の担当者に変更されました");
    for (const line of lines) {
      const locked = await tx.$queryRaw<{ id:string }[]>`
        SELECT id FROM "B2BReturnItem"
        WHERE id = ${line.returnItemId} AND "returnRequestId" = ${locator.id}
        FOR UPDATE
      `;
      if (locked.length !== 1) fail("返品申請に含まれない商品は調整できません");
    }
    // The invoice lock is AFTER the source return line locks in all credit
    // writers. DB header trigger also verifies the immutable invoice snapshot.
    const invoiceRow = await tx.$queryRaw<{id:string}[]>`
      SELECT id FROM "Invoice"
      WHERE id = ${input.originalInvoiceId}
        AND "tenantId" = ${input.sellerTenantId}
      FOR UPDATE
    `;
    if (invoiceRow.length !== 1) fail("元請求書が見つかりません");

    const existing = await tx.b2BCreditNote.findUnique({
      where: { sellerTenantId_creditNoteNumber: {
        sellerTenantId: input.sellerTenantId, creditNoteNumber,
      } },
      include: { lines: true },
    });
    if (existing) {
      const originalLines = existing.lines.map(line => ({
        returnItemId: line.returnItemId, creditedQuantity: line.creditedQuantity,
      })).sort((a,b) => a.returnItemId.localeCompare(b.returnItemId));
      if (existing.originalInvoiceId !== input.originalInvoiceId ||
          existing.returnRequestId !== input.returnRequestId ||
          existing.createdByUserId !== input.userId ||
          existing.currencyCode !== input.currencyCode ||
          JSON.stringify(originalLines) !== JSON.stringify(lines)) {
        fail("同じ再送キーを異なるクレジットノート案に利用できません");
      }
      return { creditNoteId: existing.id, created: false };
    }

    const request = await tx.b2BReturnRequest.findFirst({
      where: { id: locator.id, sellerTenantId: input.sellerTenantId },
      include: {
        companyOrder: {
          include: {
            connection: { select: { status: true } },
            sellerOrder: { select: { id: true, status: true, tenantId: true } },
            purchaseOrder: { select: { status: true } },
          },
        },
        items: { select: { id: true, approvedQuantity: true } },
      },
    });
    if (!request || !ALLOWED_RETURN_STATUSES.includes(request.status) ||
        request.companyOrder.status !== "ACCEPTED" ||
        request.companyOrder.connection.status !== "ACTIVE" ||
        request.companyOrder.purchaseOrder.status !== "RECEIVED" ||
        !request.companyOrder.sellerOrder ||
        request.companyOrder.sellerOrder.tenantId !== input.sellerTenantId ||
        !["SHIPPED", "COMPLETED"].includes(request.companyOrder.sellerOrder.status)) {
      fail("請求金額調整の前に企業間連携・返品承認・出荷・入荷を確認してください");
    }
    const invoice = await tx.invoice.findFirst({
      where: {
        id: input.originalInvoiceId, tenantId: input.sellerTenantId,
        status: { in: ["ISSUED", "PAID"] },
      },
      include: { orders: { select: { orderId: true } } },
    });
    if (!invoice ||
        !invoice.orders.some(order => order.orderId === request.companyOrder.sellerOrder.id)) {
      fail("元受注を含む発行済み請求書のみ調整対象にできます");
    }
    const requestLines = new Map(request.items.map(x => [x.id, x]));
    for (const line of lines) {
      const matched = requestLines.get(line.returnItemId);
      if (!matched || matched.approvedQuantity < line.creditedQuantity) {
        fail("承認済みの返品明細と調整数量を照合できません");
      }
      const inspected = await tx.b2BReturnStockEvent.aggregate({
        where: { returnItemId: line.returnItemId, phase: "INSPECTION" },
        _sum: { quantity: true },
      });
      const allocated = await tx.b2BCreditNoteLine.aggregate({
        where: { returnItemId: line.returnItemId },
        _sum: { creditedQuantity: true },
      });
      const available = (inspected._sum.quantity ?? 0) -
        (allocated._sum.creditedQuantity ?? 0);
      if (line.creditedQuantity > available) {
        fail("元請求書の調整数量が実検品済みの未調整数量を超えています");
      }
    }
    // Financial amounts deliberately NULL. The separate accounting workflow
    // must inspect invoice taxPerOrder, currency, prior credits and payments.
    const draft = await tx.b2BCreditNote.create({
      data: {
        sellerTenantId: input.sellerTenantId,
        originalInvoiceId: invoice.id,
        sellerOrderId: request.companyOrder.sellerOrder.id,
        returnRequestId: request.id,
        creditNoteNumber, currencyCode: input.currencyCode,
        originalInvoiceSubtotal: invoice.subtotal,
        originalInvoiceTax: invoice.tax,
        originalInvoiceTotal: invoice.total,
        originalInvoiceTaxRate: invoice.taxRate,
        originalInvoiceTaxPerOrder: invoice.taxPerOrder,
        createdByUserId: input.userId, status: "DRAFT",
      },
      select: { id: true },
    });
    await tx.b2BCreditNoteLine.createMany({
      data: lines.map(line => ({
        creditNoteId: draft.id,
        returnRequestId: request.id,
        returnItemId: line.returnItemId,
        creditedQuantity: line.creditedQuantity,
      })),
    });
    return { creditNoteId: draft.id, created: true };
  }, { isolationLevel: "Serializable", timeout: 15000 });
}
