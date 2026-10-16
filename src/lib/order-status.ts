import { prisma } from "@/lib/db";
import type { OrderStatus } from "@/generated/prisma/client";
import { canTransitionOrder, requiresOutboundMovement, requiresReturnMovement } from "@/lib/order-transitions";

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

    // Connected companies must coordinate cancellations and returns explicitly.
    // Until that workflow exists, do not silently reverse one side's stock.
    if (status === "CANCELLED") {
      const linked = await tx.intercompanyOrder.findUnique({
        where: { sellerOrderId: order.id },
        select: { id: true },
      });
      if (linked) {
        throw new Error("企業間の受注は個別に取り消せません。発注元と調整してください");
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
