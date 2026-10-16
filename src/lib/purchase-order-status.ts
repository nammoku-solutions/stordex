import { prisma } from "@/lib/db";
import type { PurchaseOrderStatus } from "@/generated/prisma/client";
import { lockBuyerPurchaseOrder } from "@/lib/b2b-locks";

/** Tenant-scoped, atomic purchase status and receipt inventory changes. */
export async function applyPurchaseOrderStatus({
  tenantId, userId, id, status,
}: {
  tenantId: string; userId: string; id: string; status: PurchaseOrderStatus;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Serialize send/accept-related checks with PO status updates.
    await lockBuyerPurchaseOrder(tx, tenantId, id);
    const po = await tx.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: { items: true, linkedCompanyOrder: { include: { sellerOrder: { select: { status: true } } } } },
    });
    if (!po) throw new Error("発注が見つかりません");
    if (po.status === status) return;
    const valid =
      (po.status === "DRAFT" && ["ORDERED", "CANCELLED"].includes(status)) ||
      (po.status === "ORDERED" && ["RECEIVED", "CANCELLED"].includes(status));
    if (!valid) throw new Error("許可されていない発注状態の変更です");

    const linked = po.linkedCompanyOrder;
    if (linked && status === "CANCELLED") {
      if (linked.status === "ACCEPTED" && linked.sellerOrder?.status !== "CANCELLED") {
        throw new Error("受注企業が承認済みです。先方が出荷前の受注を取り消した後に発注取消できます");
      }
      if (linked.status === "SENT" || linked.status === "ACCEPTED") {
        const changed = await tx.intercompanyOrder.updateMany({
          where: {
            id: linked.id, buyerTenantId: tenantId,
            status: linked.status,
          },
          data: { status: "CANCELLED" },
        });
        if (changed.count !== 1) throw new Error("先方で注文が処理されたため取消できません");
      }
    }
    if (linked && status === "RECEIVED" &&
        (linked.status !== "ACCEPTED" ||
          !linked.sellerOrder ||
          !["SHIPPED", "COMPLETED"].includes(linked.sellerOrder.status))) {
      throw new Error("企業間発注の入荷は、先方の受注が出荷済みになってから確定してください");
    }

    // Conditional claim prevents repeated RECEIVE from incrementing inventory twice.
    const changed = await tx.purchaseOrder.updateMany({
      where: { id: po.id, tenantId, status: po.status },
      data: { status },
    });
    if (changed.count !== 1) throw new Error("発注が別の操作で変更されました");

    if (status === "RECEIVED") {
      for (const line of po.items) {
        const delta = line.quantity - line.received;
        if (delta <= 0) continue;
        const updated = await tx.item.update({
          where: { id: line.itemId, tenantId },
          data: { stock: { increment: delta } },
          select: { stock: true },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            itemId: line.itemId,
            type: "INBOUND",
            quantity: delta,
            balance: updated.stock,
            reference: po.poNumber,
            note: `仕入入庫: ${po.poNumber}`,
            createdBy: userId,
          },
        });
        await tx.purchaseOrderItem.update({
          where: { id: line.id },
          data: { received: line.quantity },
        });
      }
    }
  });
}
