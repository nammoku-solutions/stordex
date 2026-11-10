/**
 * Issue #82 — DRAFT ONLY. Atomic physical return status CAS and immutable audit.
 * Never import this module from a Server Action/UI before separate migration
 * authorization, restore verification, and a controlled staging release.
 * Contains no credit-note or settlement dependency; CLOSED/CREDIT_PENDING
 * transitions are intentionally forbidden until finance reconciliation exists.
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { lockBuyerPurchaseOrder, lockCompanyConnection } from "@/lib/b2b-locks";
import { assessB2BReturnStatusTransition } from "@/lib/b2b-return-transition";
import type { Prisma } from "@/generated/prisma/client";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
type SourceStatus = "APPROVED" | "PARTIALLY_APPROVED" | "DISPATCHED" |
  "PARTIALLY_INSPECTED" | "INSPECTED";
type TargetStatus = "DISPATCHED" | "PARTIALLY_INSPECTED" | "INSPECTED";
type Input = {
  tenantId: string;
  userId: string;
  returnRequestId: string;
  eventId: string;
  expectedStatus: SourceStatus;
  targetStatus: TargetStatus;
};
type Result = { eventRecordId: string; created: boolean; status: TargetStatus };

export class B2BReturnStatusWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "B2BReturnStatusWriteError";
  }
}
function reject(message: string): never {
  throw new B2BReturnStatusWriteError(message);
}
function payloadHash(input: Input, eventId: string): string {
  return createHash("sha256").update(JSON.stringify([
    "b2b-return-status-v1", input.tenantId, input.userId,
    input.returnRequestId, eventId, input.expectedStatus, input.targetStatus,
  ])).digest("hex");
}
async function verifiedActor(
  tx: Prisma.TransactionClient, tenantId: string, userId: string,
) {
  const actor = await tx.user.findFirst({
    where: {
      id: userId, tenantId, role: { in: ["OWNER", "ADMIN"] },
      tenant: { status: "ACTIVE" },
    },
    select: {id: true, role: true},
  });
  if (!actor) reject("ステータス変更には所属企業の有効な管理者権限が必要です");
  return actor;
}

export async function recordPhysicalReturnStatus(input: Input): Promise<Result> {
  if (!ID.test(input.tenantId) || !ID.test(input.userId) ||
      !ID.test(input.returnRequestId) || !UUID.test(input.eventId)) {
    reject("返品申請・企業・ユーザー・イベント識別子が不正です");
  }
  const eventId = input.eventId.toLowerCase();
  const hash = payloadHash(input, eventId);
  const side = input.targetStatus === "DISPATCHED" ? "BUYER" as const : "SELLER" as const;
  // Deny closure regardless of accounting booleans; a future verified
  // settlement ledger writer will own CREDIT_PENDING -> CLOSED.
  // PostgreSQL serialization failures can happen when two return actors
  // touch the same request. Re-run authorization, source locks and event
  // evidence in a fresh SERIALIZABLE transaction on those conflicts only.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
    const actor = await verifiedActor(tx, input.tenantId, input.userId);
    const source = await tx.b2BReturnRequest.findFirst({
      where: {
        id: input.returnRequestId,
        ...(side === "BUYER"
          ? { buyerTenantId: input.tenantId }
          : { sellerTenantId: input.tenantId }),
      },
      select: {
        id: true,
        companyOrder: { select: {
          buyerTenantId: true, purchaseOrderId: true, connectionId: true,
        } },
      },
    });
    if (!source) reject("所属企業の返品申請が見つかりません");

    // Identical lock order as B2B stock writer and credit draft writer.
    await lockBuyerPurchaseOrder(
      tx, source.companyOrder.buyerTenantId, source.companyOrder.purchaseOrderId,
    );
    await lockCompanyConnection(tx, source.companyOrder.connectionId);
    const locked = await tx.$queryRaw<{id:string}[]>`
      SELECT id FROM "B2BReturnRequest"
      WHERE id = ${source.id} FOR UPDATE
    `;
    if (locked.length !== 1) reject("返品申請をロックできません");
    const lockedLines = await tx.$queryRaw<{id:string}[]>`
      SELECT id FROM "B2BReturnItem"
      WHERE "returnRequestId" = ${source.id}
      ORDER BY id FOR UPDATE
    `;
    if (!lockedLines.length || lockedLines.length > 100) {
      reject("返品明細が存在しないか、上限を超えています");
    }
    const existing = await tx.b2BReturnStatusEvent.findUnique({
      where: {
        tenantId_eventId: {tenantId: input.tenantId, eventId},
      },
    });
    if (existing) {
      if (existing.returnRequestId !== input.returnRequestId ||
          existing.actorUserId !== input.userId ||
          existing.fromStatus !== input.expectedStatus ||
          existing.toStatus !== input.targetStatus ||
          existing.payloadHash !== hash) {
        reject("同じイベントIDが異なるステータス変更に使用されています");
      }
      return {
        eventRecordId: existing.id, created: false, status: input.targetStatus,
      };
    }

    const request = await tx.b2BReturnRequest.findUnique({
      where: {id: source.id},
      include: {
        companyOrder: { include: {
          connection: {select:{status:true}},
          purchaseOrder: {select:{status:true,tenantId:true}},
          sellerOrder: {select:{status:true,tenantId:true}},
        } },
        items: {orderBy:{id:"asc"},include:{
          stockEvents:{select:{phase:true,quantity:true}},
        }},
      },
    });
    if (!request || request.status !== input.expectedStatus) {
      reject("返品状態が他の操作で変更されました。画面を更新してください");
    }
    if (request.companyOrder.status !== "ACCEPTED" ||
        request.companyOrder.connection.status !== "ACTIVE" ||
        request.companyOrder.purchaseOrder.status !== "RECEIVED" ||
        request.companyOrder.purchaseOrder.tenantId !== request.buyerTenantId ||
        !request.companyOrder.sellerOrder ||
        !["SHIPPED","COMPLETED"].includes(request.companyOrder.sellerOrder.status) ||
        request.companyOrder.sellerOrder.tenantId !== request.sellerTenantId) {
      reject("企業間接続・元受発注の状態が変更されました");
    }
    if (request.items.length !== lockedLines.length) {
      reject("返品明細の状態が変更されました");
    }
    const lines = request.items.map(line => ({
      id: line.id,
      requested: line.requestedQuantity,
      approved: line.approvedQuantity,
      dispatched: line.stockEvents.filter(x=>x.phase==="DISPATCH")
        .reduce((sum,x)=>sum+x.quantity,0),
      inspected: line.stockEvents.filter(x=>x.phase==="INSPECTION")
        .reduce((sum,x)=>sum+x.quantity,0),
      draftCreditAllocated: 0, // No CreditNote ledger in approved Staging baseline.
    }));
    assessB2BReturnStatusTransition({
      currentStatus: request.status,
      targetStatus: input.targetStatus,
      actorSide: side,
      actorRole: actor.role,
      lines,
      financialResolution: "NOT_REVIEWED",
      settlementLedgerVerified: false,
      closeReason: null,
    });
    const snapshotHash = createHash("sha256").update(JSON.stringify({
      returnRequestId: input.returnRequestId,
      fromStatus: request.status,
      toStatus: input.targetStatus,
      lines,
    })).digest("hex");

    const updated = await tx.b2BReturnRequest.updateMany({
      where: {
        id: request.id, status: input.expectedStatus,
        ...(side === "BUYER"
          ? { buyerTenantId: input.tenantId }
          : { sellerTenantId: input.tenantId }),
      },
      data: {status: input.targetStatus},
    });
    if (updated.count !== 1) reject("他の担当者が返品状態を更新しました");
    const event = await tx.b2BReturnStatusEvent.create({data: {
      tenantId: input.tenantId,
      returnRequestId: input.returnRequestId,
      eventId, payloadHash: hash, sourceTotalsHash: snapshotHash,
      fromStatus: input.expectedStatus,
      toStatus: input.targetStatus,
      actorUserId: input.userId,
    }});
    return {eventRecordId:event.id,created:true,status:input.targetStatus};
      }, {isolationLevel:"Serializable",timeout:15000});
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? error.code : undefined;
      if ((code !== "P2034" && code !== "40001") || attempt === 2) throw error;
    }
  }
  throw new Error("Unreachable physical status writer retry limit");
}
