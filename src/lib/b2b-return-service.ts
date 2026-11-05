/**
 * Issue #82. Draft-only B2B return application services, not exposed as
 * Server Actions, routes or UI until migrations #107/#112 pass recovery gates.
 *
 * The only writes are B2BReturnRequest/Item. No inventory, credit, receipt,
 * shipment, sales order or purchase-order writes, and no emails are sent.
 */
import { prisma } from "@/lib/db";
import { lockBuyerPurchaseOrder, lockCompanyConnection } from "@/lib/b2b-locks";
import { planB2BReturnQuantity } from "@/lib/b2b-return-quantity";
import { assessB2BReturnReview } from "@/lib/b2b-return-review";
import type { Prisma } from "@/generated/prisma/client";

const INT4_MAX = 2_147_483_647;
const MAX_LINES = 100;
const ACTIVE_RETURN_STATUSES = [
  "SUBMITTED", "UNDER_REVIEW", "PARTIALLY_APPROVED", "APPROVED",
  "DISPATCHED", "PARTIALLY_INSPECTED", "INSPECTED", "CREDIT_PENDING", "CLOSED",
] as const;

export class B2BReturnServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "B2BReturnServiceError";
  }
}

type ReturnReason = "DAMAGED" | "WRONG_ITEM" | "UNWANTED" | "OTHER";
type RequestedReturnLine = {
  sourceLineId: string;
  requestedQuantity: number;
  reason: ReturnReason;
  note?: string | null;
};
type ReviewReturnLine = {
  sourceLineId: string;
  approvedQuantity: number;
};
function fail(message: string): never {
  throw new B2BReturnServiceError(message);
}
function requireQuantity(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > INT4_MAX) {
    fail("返品数量は1〜2,147,483,647の整数で入力してください");
  }
}
async function requireOperator(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
): Promise<void> {
  const actor = await tx.user.findFirst({
    where: { id: userId, tenantId, role: { in: ["OWNER", "ADMIN"] },
      tenant: { status: "ACTIVE" } },
    select: { id: true },
  });
  if (!actor) fail("この企業の管理者権限が必要です");
}
function normalizeRequestLines(lines: readonly RequestedReturnLine[]) {
  if (!lines.length || lines.length > MAX_LINES) {
    fail("返品明細は1〜100件で指定してください");
  }
  const ids = new Set<string>();
  return lines.map(line => {
    if (!line.sourceLineId?.trim() || ids.has(line.sourceLineId)) {
      fail("返品明細IDが不正、または重複しています");
    }
    ids.add(line.sourceLineId);
    requireQuantity(line.requestedQuantity);
    if (!["DAMAGED", "WRONG_ITEM", "UNWANTED", "OTHER"].includes(line.reason)) {
      fail("返品理由が不正です");
    }
    const note = line.note?.trim() || null;
    if (note && note.length > 500) fail("返品の備考は500文字以内にしてください");
    return {
      sourceLineId: line.sourceLineId,
      requestedQuantity: line.requestedQuantity,
      reason: line.reason,
      note,
    };
  }).sort((a, b) => a.sourceLineId.localeCompare(b.sourceLineId));
}

/** Stable client UUID -> same return request on duplicate submit/retry. */
export function returnRequestNumber(idempotencyKey: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
    .test(idempotencyKey)) {
    return fail("返品申請の再試行キーが不正です");
  }
  return "RET-" + idempotencyKey.toLowerCase();
}

export async function submitB2BReturnRequest(input: {
  buyerTenantId: string;
  userId: string;
  intercompanyOrderId: string;
  idempotencyKey: string;
  lines: readonly RequestedReturnLine[];
}): Promise<{ requestId: string; created: boolean }> {
  const lines = normalizeRequestLines(input.lines);
  const requestNumber = returnRequestNumber(input.idempotencyKey);
  if (!input.buyerTenantId || !input.userId || !input.intercompanyOrderId) {
    fail("返品対象と担当者を指定してください");
  }
  return prisma.$transaction(async tx => {
    await requireOperator(tx, input.buyerTenantId, input.userId);
    // Read only a locator first; lock buyer PO before connection, following
    // the existing B2B lock order to avoid lock inversion.
    const source = await tx.intercompanyOrder.findFirst({
      where: { id: input.intercompanyOrderId, buyerTenantId: input.buyerTenantId },
      select: { id: true, purchaseOrderId: true, connectionId: true },
    });
    if (!source) fail("企業間発注が見つかりません");
    await lockBuyerPurchaseOrder(tx, input.buyerTenantId, source.purchaseOrderId);
    await lockCompanyConnection(tx, source.connectionId);

    const company = await tx.intercompanyOrder.findFirst({
      where: { id: source.id, buyerTenantId: input.buyerTenantId, status: "ACCEPTED" },
      include: {
        connection: { select: { status: true } },
        purchaseOrder: { include: { items: true } },
        sellerOrder: { include: { items: true } },
        items: true,
      },
    });
    if (!company || company.connection.status !== "ACTIVE" ||
      company.purchaseOrder.status !== "RECEIVED" ||
      !company.sellerOrder ||
      !["SHIPPED", "COMPLETED"].includes(company.sellerOrder.status)) {
      fail("取引先接続・出荷・入荷状況を確認してください");
    }
    if (company.purchaseOrder.tenantId !== input.buyerTenantId ||
      company.sellerOrder.tenantId !== company.sellerTenantId) {
      fail("企業間取引の所有企業が一致しません");
    }

    const existing = await tx.b2BReturnRequest.findUnique({
      where: { buyerTenantId_requestNumber: {
        buyerTenantId: input.buyerTenantId, requestNumber,
      } },
      include: { items: true },
    });
    if (existing) {
      const saved = existing.items.map(item => ({
        sourceLineId: item.sourceLineId, requestedQuantity: item.requestedQuantity,
        reason: item.reason, note: item.note,
      })).sort((a, b) => a.sourceLineId.localeCompare(b.sourceLineId));
      if (existing.intercompanyOrderId !== company.id ||
        existing.requestedByUserId !== input.userId ||
        JSON.stringify(saved) !== JSON.stringify(lines)) {
        fail("同じ再試行キーで異なる返品申請を作成することはできません");
      }
      return { requestId: existing.id, created: false };
    }

    const sourceLines = new Map(company.items.map(item => [item.id, item]));
    const poLines = new Map(company.purchaseOrder.items.map(item => [item.id, item]));
    const sellerLines = new Map(company.sellerOrder.items.map(item => [item.id, item]));
    // The PO row lock serializes ALL requests for its source lines. Count
    // pending requests at requested quantity; reviewed requests at approved
    // quantity; rejected/withdrawn requests release their budget.
    for (const line of lines) {
      const sourceLine = sourceLines.get(line.sourceLineId);
      const buyerLine = sourceLine && poLines.get(sourceLine.sourcePurchaseOrderItemId);
      const sellerLine = sourceLine?.sellerOrderItemId
        ? sellerLines.get(sourceLine.sellerOrderItemId) : undefined;
      if (!sourceLine || !buyerLine || !sellerLine ||
        sellerLine.orderId !== company.sellerOrder.id ||
        buyerLine.purchaseOrderId !== company.purchaseOrderId ||
        sourceLine.quantity !== buyerLine.quantity ||
        sourceLine.quantity !== sellerLine.quantity ||
        sourceLine.unit !== buyerLine.unit ||
        sourceLine.unit !== sellerLine.unit) {
        fail("元発注明細と売り手の受注明細を照合できません。手動確認が必要です");
      }
      const prior = await tx.b2BReturnItem.findMany({
        where: {
          sourceLineId: sourceLine.id,
          intercompanyOrderId: company.id,
          returnRequest: { status: { in: [...ACTIVE_RETURN_STATUSES] } },
        },
        include: { returnRequest: { select: { status: true } } },
      });
      let committed = 0;
      for (const record of prior) {
        const pending = ["SUBMITTED", "UNDER_REVIEW"].includes(record.returnRequest.status);
        committed += pending ? record.requestedQuantity : record.approvedQuantity;
      }
      planB2BReturnQuantity({
        sellerOrderItemId: sourceLine.sellerOrderItemId,
        originalOrdered: buyerLine.quantity,
        sellerShipped: sellerLine.quantity,
        buyerReceived: buyerLine.received,
        alreadyCommitted: committed,
        requested: line.requestedQuantity,
      });
    }
    const created = await tx.b2BReturnRequest.create({
      data: {
        intercompanyOrderId: company.id,
        buyerTenantId: company.buyerTenantId,
        sellerTenantId: company.sellerTenantId,
        requestNumber, requestedByUserId: input.userId,
        status: "SUBMITTED",
        items: {
          create: lines.map(line => ({
            intercompanyOrderId: company.id,
            sourceLineId: line.sourceLineId,
            requestedQuantity: line.requestedQuantity,
            reason: line.reason,
            note: line.note,
          })),
        },
      },
      select: { id: true },
    });
    return { requestId: created.id, created: true };
  }, { isolationLevel: "Serializable", timeout: 15000 });
}

export async function reviewB2BReturnRequest(input: {
  sellerTenantId: string;
  userId: string;
  requestId: string;
  decisions: readonly ReviewReturnLine[];
  reviewNote?: string | null;
}): Promise<{ requestId: string; status: "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED" }> {
  if (!input.sellerTenantId || !input.userId || !input.requestId) {
    fail("返品申請と担当者を指定してください");
  }
  return prisma.$transaction(async tx => {
    await requireOperator(tx, input.sellerTenantId, input.userId);
    const locator = await tx.b2BReturnRequest.findFirst({
      where: { id: input.requestId, sellerTenantId: input.sellerTenantId },
      select: { id: true, companyOrder: {
        select: { purchaseOrderId: true, buyerTenantId: true, connectionId: true },
      } },
    });
    if (!locator) fail("審査対象の返品申請が見つかりません");
    // The same lock order as submit. Prevents review vs budget-carrying
    // submission from racing or creating an inconsistent pending tally.
    await lockBuyerPurchaseOrder(
      tx, locator.companyOrder.buyerTenantId, locator.companyOrder.purchaseOrderId,
    );
    await lockCompanyConnection(tx, locator.companyOrder.connectionId);
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "B2BReturnRequest"
      WHERE id = ${input.requestId} AND "sellerTenantId" = ${input.sellerTenantId}
      FOR UPDATE
    `;
    if (locked.length !== 1) fail("返品申請の審査ロックを取得できません");
    const request = await tx.b2BReturnRequest.findFirst({
      where: { id: input.requestId, sellerTenantId: input.sellerTenantId },
      include: { items: true, companyOrder: {
        include: { connection: { select: { status: true } },
          purchaseOrder: { select: { status: true } },
          sellerOrder: { select: { status: true } } },
      } },
    });
    if (!request || request.companyOrder.status !== "ACCEPTED" ||
      request.companyOrder.connection.status !== "ACTIVE" ||
      request.companyOrder.purchaseOrder.status !== "RECEIVED" ||
      !request.companyOrder.sellerOrder ||
      !["SHIPPED", "COMPLETED"].includes(request.companyOrder.sellerOrder.status)) {
      fail("企業間接続・出荷・入荷の状態が変更されています");
    }
    const decisionMap = new Map<string, number>();
    for (const decision of input.decisions) {
      if (!decision.sourceLineId?.trim() || decisionMap.has(decision.sourceLineId)) {
        fail("審査対象明細IDが不正、または重複しています");
      }
      decisionMap.set(decision.sourceLineId, decision.approvedQuantity);
    }
    if (request.items.length !== decisionMap.size) {
      fail("すべての返品明細に承認数量を指定してください");
    }
    const decision = assessB2BReturnReview({
      currentStatus: request.status, reviewNote: input.reviewNote,
      lines: request.items.map(line => ({
        sourceLineId: line.sourceLineId,
        requestedQuantity: line.requestedQuantity,
        approvedQuantity: decisionMap.get(line.sourceLineId) ?? NaN,
      })),
    });
    const now = new Date();
    const claimed = await tx.b2BReturnRequest.updateMany({
      where: { id: request.id, sellerTenantId: input.sellerTenantId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      data: { status: decision.status, reviewedByUserId: input.userId,
        reviewNote: decision.reviewNote, reviewedAt: now },
    });
    if (claimed.count !== 1) fail("別の担当者がすでに審査を確定しました");
    for (const line of request.items) {
      const result = await tx.b2BReturnItem.updateMany({
        where: { id: line.id, returnRequestId: request.id,
          approvedQuantity: 0, decidedAt: null },
        data: {
          approvedQuantity: decisionMap.get(line.sourceLineId)!,
          decidedByUserId: input.userId, decidedAt: now,
        },
      });
      if (result.count !== 1) fail("明細が変更されています。審査をやり直してください");
    }
    return { requestId: request.id, status: decision.status };
  }, { isolationLevel: "Serializable", timeout: 15000 });
}
