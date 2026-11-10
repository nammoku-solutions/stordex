/**
 * Issue #82 — DRAFT ONLY: transactional physical return posting.
 *
 * This module writes Item.stock and InventoryMovement if invoked.
 * It is NOT imported by any Server Action, route or UI.
 * Do NOT merge into Staging before an approved ledger migration, independently
 * verified restore, isolated integration tests and browser UAT.
 * Production is out of scope.
 */
import { prisma } from "@/lib/db";
import { lockBuyerPurchaseOrder, lockCompanyConnection } from "@/lib/b2b-locks";
import {
  fingerprintReturnEvent,
  planBuyerReturnDispatch,
  planSellerReturnInspection,
} from "@/lib/b2b-return-event-plans";
import type { Prisma } from "@/generated/prisma/client";

type Phase = "DISPATCH" | "INSPECTION";
type Role = "BUYER" | "SELLER";
const POSTABLE = new Set([
  "APPROVED", "PARTIALLY_APPROVED", "DISPATCHED", "PARTIALLY_INSPECTED",
]);

export class B2BReturnPostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "B2BReturnPostingError";
  }
}
function fail(message: string): never {
  throw new B2BReturnPostingError(message);
}
async function requireManager(tx: Prisma.TransactionClient, tenantId: string, userId: string) {
  const user = await tx.user.findFirst({
    where: {
      id: userId, tenantId, role: { in: ["OWNER", "ADMIN"] },
      tenant: { status: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!user) fail("返品の返送・検品には管理者権限が必要です");
}

type InputBase = {
  tenantId: string;
  userId: string;
  returnItemId: string;
  eventId: string;
};
type DispatchInput = InputBase & { quantity: number };
type InspectionInput = InputBase & {
  receivedNow: number;
  saleable: number;
  unsaleable: number;
};
type Result = { stockEventId: string; created: boolean };

async function withLockedSource<T>(
  side: Role, input: InputBase,
  action: (tx: Prisma.TransactionClient, context: {
    returnItem: NonNullable<Awaited<ReturnType<typeof readReturnItem>>>;
    buyerItemId: string; sellerItemId: string;
  }) => Promise<T>,
): Promise<T> {
  // Retries only transaction serialization conflicts. Revalidates stock,
  // permissions and the cumulative approved quantity inside every attempt.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await requireManager(tx, input.tenantId, input.userId);
    // Locate only a row within the caller's company boundary.
    const locator = await tx.b2BReturnItem.findFirst({
      where: {
        id: input.returnItemId,
        returnRequest: side === "BUYER"
          ? { buyerTenantId: input.tenantId }
          : { sellerTenantId: input.tenantId },
      },
      select: {
        id: true, returnRequestId: true,
        returnRequest: { select: {
          companyOrder: { select: {
            buyerTenantId: true, purchaseOrderId: true, connectionId: true,
          } },
        } },
      },
    });
    if (!locator) fail("対象の返品明細が見つかりません");

    // Lock ordering shared by all B2B writers: buyer PO -> connection ->
    // return request -> return line -> individual Item conditional CAS.
    const company = locator.returnRequest.companyOrder;
    await lockBuyerPurchaseOrder(tx, company.buyerTenantId, company.purchaseOrderId);
    await lockCompanyConnection(tx, company.connectionId);
    const lockedRequest = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "B2BReturnRequest" WHERE id = ${locator.returnRequestId}
      FOR UPDATE
    `;
    const lockedLine = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "B2BReturnItem" WHERE id = ${locator.id}
      FOR UPDATE
    `;
    if (lockedRequest.length !== 1 || lockedLine.length !== 1) {
      fail("返品申請のロックが取得できませんでした");
    }
    const returnItem = await readReturnItem(tx, locator.id);
    if (!returnItem) fail("返品申請の内容が変更されました");
    const linked = returnItem.returnRequest.companyOrder;
    const sourceLine = returnItem.sourceLine;
    const buyerLine = linked.purchaseOrder.items.find(
      line => line.id === sourceLine.sourcePurchaseOrderItemId,
    );
    const sellerLine = linked.sellerOrder?.items.find(
      line => line.id === sourceLine.sellerOrderItemId,
    );
    if (!buyerLine || !sellerLine ||
        linked.purchaseOrder.tenantId !== linked.buyerTenantId ||
        linked.sellerOrder?.tenantId !== linked.sellerTenantId ||
        sourceLine.quantity !== buyerLine.quantity ||
        sourceLine.quantity !== sellerLine.quantity ||
        sourceLine.unit !== buyerLine.unit ||
        sourceLine.unit !== sellerLine.unit) {
      fail("返品元商品の対応関係が不正です。手動照合を依頼してください");
    }
    if (side === "BUYER" && input.tenantId !== linked.buyerTenantId ||
        side === "SELLER" && input.tenantId !== linked.sellerTenantId) {
      fail("異なる企業の返品操作はできません");
    }
    return action(tx, {
      returnItem,
      buyerItemId: buyerLine.itemId,
      sellerItemId: sellerLine.itemId,
    });
      }, { isolationLevel: "Serializable", timeout: 15000 });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? error.code : undefined;
      if ((code !== "P2034" && code !== "40001") || attempt === 2) throw error;
    }
  }
  throw new Error("Unreachable physical return retry limit");
}

async function readReturnItem(tx: Prisma.TransactionClient, returnItemId: string) {
  return tx.b2BReturnItem.findUnique({
    where: { id: returnItemId },
    include: {
      sourceLine: true,
      returnRequest: { include: {
        companyOrder: { include: {
          connection: true,
          purchaseOrder: { include: { items: true } },
          sellerOrder: { include: { items: true } },
        } },
      } },
    },
  });
}

function assertSourceActive(returnItem: NonNullable<Awaited<ReturnType<typeof readReturnItem>>>) {
  const request = returnItem.returnRequest;
  const company = request.companyOrder;
  if (!POSTABLE.has(request.status) ||
      returnItem.approvedQuantity <= 0 ||
      company.status !== "ACCEPTED" || company.connection.status !== "ACTIVE" ||
      company.purchaseOrder.status !== "RECEIVED" ||
      !company.sellerOrder ||
      !["SHIPPED", "COMPLETED"].includes(company.sellerOrder.status)) {
    fail("承認済みの返品・出荷・入荷状況と企業間接続を再確認してください");
  }
}

async function checkExisting(
  tx: Prisma.TransactionClient,
  input: InputBase,
  phase: Phase,
  itemId: string,
  quantities: number[],
): Promise<Result | null> {
  const fingerprint = fingerprintReturnEvent({
    eventId: input.eventId, tenantId: input.tenantId,
    returnLineId: input.returnItemId, itemId, phase, quantities,
  });
  const existing = await tx.b2BReturnStockEvent.findUnique({
    where: { tenantId_phase_eventId: {
      tenantId: input.tenantId, phase, eventId: fingerprint.eventId,
    } },
  });
  if (!existing) return null;
  if (existing.returnItemId !== input.returnItemId ||
      existing.createdByUserId !== input.userId ||
      existing.payloadHash !== fingerprint.payloadHash) {
    fail("同じイベントIDで異なる返品データを記録することはできません");
  }
  // Replays are truly no-op even if the current stock or connection has
  // changed since the successful first COMMIT.
  return { stockEventId: existing.id, created: false };
}

export async function postBuyerReturnDispatch(input: DispatchInput): Promise<Result> {
  return withLockedSource("BUYER", input, async (tx, { returnItem, buyerItemId }) => {
    const repeated = await checkExisting(tx, input, "DISPATCH", buyerItemId, [input.quantity]);
    if (repeated) return repeated;
    assertSourceActive(returnItem);
    const item = await tx.item.findFirst({
      where: { id: buyerItemId, tenantId: input.tenantId, active: true },
      select: { id: true, stock: true },
    });
    if (!item) fail("買い手の対象商品が利用できません");
    const prior = await tx.b2BReturnStockEvent.aggregate({
      where: { returnItemId: returnItem.id, phase: "DISPATCH" },
      _sum: { quantity: true },
    });
    const planned = planBuyerReturnDispatch({
      eventId: input.eventId, tenantId: input.tenantId,
      returnLineId: returnItem.id, buyerItemId,
      approved: returnItem.approvedQuantity,
      alreadyDispatched: prior._sum.quantity ?? 0,
      dispatch: input.quantity, currentBuyerStock: item.stock,
    });
    const changed = await tx.item.updateMany({
      where: { id: item.id, tenantId: input.tenantId, active: true, stock: item.stock },
      data: { stock: planned.newStock },
    });
    if (changed.count !== 1) fail("在庫が別の担当者により更新されました。再確認してください");
    const movement = await tx.inventoryMovement.create({
      data: {
        tenantId: input.tenantId, itemId: item.id,
        type: "OUTBOUND", quantity: planned.quantity,
        balance: planned.newStock,
        reference: returnItem.returnRequest.requestNumber + " 返品返送",
        createdBy: input.userId,
      },
    });
    const event = await tx.b2BReturnStockEvent.create({
      data: {
        tenantId: input.tenantId, returnItemId: returnItem.id,
        phase: "DISPATCH", eventId: planned.eventId,
        payloadHash: planned.payloadHash, quantity: planned.quantity,
        saleable: 0, unsaleable: 0,
        movementId: movement.id, createdByUserId: input.userId,
      },
    });
    return { stockEventId: event.id, created: true };
  });
}

export async function postSellerReturnInspection(input: InspectionInput): Promise<Result> {
  return withLockedSource("SELLER", input, async (tx, { returnItem, sellerItemId }) => {
    const repeated = await checkExisting(
      tx, input, "INSPECTION", sellerItemId,
      [input.receivedNow, input.saleable, input.unsaleable],
    );
    if (repeated) return repeated;
    assertSourceActive(returnItem);
    const item = await tx.item.findFirst({
      where: { id: sellerItemId, tenantId: input.tenantId, active: true },
      select: { id: true, stock: true },
    });
    if (!item) fail("売り手の対象商品が利用できません");
    const events = await tx.b2BReturnStockEvent.groupBy({
      by: ["phase"], where: { returnItemId: returnItem.id },
      _sum: { quantity: true },
    });
    const dispatched = events.find(x => x.phase === "DISPATCH")?._sum.quantity ?? 0;
    const inspected = events.find(x => x.phase === "INSPECTION")?._sum.quantity ?? 0;
    const planned = planSellerReturnInspection({
      eventId: input.eventId, tenantId: input.tenantId,
      returnLineId: returnItem.id, sellerItemId,
      dispatched, alreadyInspected: inspected,
      receivedNow: input.receivedNow,
      saleable: input.saleable, unsaleable: input.unsaleable,
      currentSellerStock: item.stock,
    });
    let movementId: string | null = null;
    if (planned.quantity > 0) {
      const changed = await tx.item.updateMany({
        where: { id: item.id, tenantId: input.tenantId, active: true, stock: item.stock },
        data: { stock: planned.newStock },
      });
      if (changed.count !== 1) fail("在庫が別の担当者により更新されました。再確認してください");
      const movement = await tx.inventoryMovement.create({
        data: {
          tenantId: input.tenantId, itemId: item.id,
          type: "INBOUND", quantity: planned.quantity,
          balance: planned.newStock,
          reference: returnItem.returnRequest.requestNumber + " 返品検品良品",
          createdBy: input.userId,
        },
      });
      movementId = movement.id;
    }
    const event = await tx.b2BReturnStockEvent.create({
      data: {
        tenantId: input.tenantId, returnItemId: returnItem.id,
        phase: "INSPECTION", eventId: planned.eventId,
        payloadHash: planned.payloadHash, quantity: input.receivedNow,
        saleable: planned.quantity, unsaleable: planned.quarantine,
        movementId, createdByUserId: input.userId,
      },
    });
    return { stockEventId: event.id, created: true };
  });
}
