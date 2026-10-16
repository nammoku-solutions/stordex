import { prisma } from "@/lib/db";
import type { OrderStatus } from "@/generated/prisma/client";
import { canTransitionOrder, requiresOutboundMovement, requiresReturnMovement } from "@/lib/order-transitions";
import { lockBuyerPurchaseOrder } from "@/lib/b2b-locks";

/** Shared, database-tested atomic state transition used by the server action. */
export async function applyOrderStatus({
  tenantId, userId, orderId, status,
}: {
  tenantId: string;
  userId: string;
  orderId: string;
  status: OrderStatus;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });
    if (!order) throw new Error("注文が見つかりません");
    // Retrying the same operation must never repeat an inventory movement.
    if (order.status === status) return;
    if (!canTransitionOrder(order.status, status)) {
      throw new Error("許可されていない受注状態の変更です。画面を更新してください");
    }

    // For a connected-company order, the seller records the agreed cancellation
    // first; the buyer then cancels their own PO after seeing that status.
    // Do not allow unilateral cancellation after shipment/receipt.
    if (status === "CANCELLED") {
      const linked = await tx.intercompanyOrder.findUnique({
        where: { sellerOrderId: order.id },
        select: { id: true, status: true, buyerTenantId: true, sellerTenantId: true, purchaseOrderId: true },
      });
      if (linked) {
        if (linked.sellerTenantId !== tenantId || linked.status !== "ACCEPTED") {
          throw new Error("企業間受注の状態が変更されました。画面を更新してください");
        }
        // Same lock ordering as buyer PO cancellation. Prevents receipt/cancel
        // from passing a stale buyer status while seller reverses inventory.
        await lockBuyerPurchaseOrder(tx, linked.buyerTenantId, linked.purchaseOrderId);
        const buyerPO = await tx.purchaseOrder.findUnique({
          where: { id: linked.purchaseOrderId }, select: { status: true },
        });
        if (buyerPO?.status !== "ORDERED") {
          throw new Error("発注元が入荷・取消処理済みのため、この受注は取り消せません");
        }
        // Linked invoices require a separate credit-note workflow; never
        // silently restore inventory while leaving billed documents intact.
        const invoiceLink = await tx.invoiceOrder.findFirst({
          where: { orderId: order.id }, select: { invoiceId: true },
        });
        if (invoiceLink) {
          throw new Error("請求書に紐づく企業間受注は、この取消機能では処理できません");
        }
      }
    }

    // Compare-and-swap protects against duplicate clicks and parallel transitions.
    // A failed claim rolls back the entire transaction, including any movements.
    const claim = await tx.order.updateMany({
      where: { id: order.id, tenantId, status: order.status },
      data: { status },
    });
    if (claim.count !== 1) {
      throw new Error("別の担当者が注文を更新しました。画面を再読み込みしてください");
    }

    if (requiresOutboundMovement(order.status, status)) {
      for (const line of order.items) {
        const changed = await tx.item.updateMany({
          where: { id: line.itemId, tenantId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (changed.count !== 1) {
          throw new Error(`商品「${line.itemName}」の在庫が不足しています`);
        }
        const updated = await tx.item.findUniqueOrThrow({
          where: { id: line.itemId }, select: { stock: true },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            itemId: line.itemId,
            type: "OUTBOUND",
            quantity: line.quantity,
            balance: updated.stock,
            reference: order.orderNumber,
            createdBy: userId,
          },
        });
      }
    }
    if (requiresReturnMovement(order.status, status)) {
      for (const line of order.items) {
        const updated = await tx.item.update({
          where: { id: line.itemId, tenantId },
          data: { stock: { increment: line.quantity } },
          select: { stock: true },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            itemId: line.itemId,
            type: "INBOUND",
            quantity: line.quantity,
            balance: updated.stock,
            reference: `${order.orderNumber} 取消`,
            createdBy: userId,
          },
        });
      }
    }
  });
}
