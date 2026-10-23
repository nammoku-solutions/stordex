import { prisma } from "@/lib/db";
import type { PurchaseOrderStatus } from "@/generated/prisma/client";
import { lockBuyerPurchaseOrder } from "@/lib/b2b-locks";

/** Tenant-scoped, atomic purchase status and receipt inventory changes. */
export async function applyPurchaseOrderStatus({
  tenantId, userId, id, status, actualReceipts, discrepancyReason,
}: {
  tenantId: string; userId: string; id: string; status: PurchaseOrderStatus;
  /** Optional counted quantities; existing transitions retain the original order quantity. */
  actualReceipts?: Record<string, number>;
  discrepancyReason?: string;
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
      // Future partial receipts require a separate return workflow, even if
      // the PO status has not yet been moved to RECEIVED.
      if (po.items.some(line => line.received > 0)) {
        throw new Error("一部でも入荷済みの発注は、この取消機能では処理できません");
      }
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

    // Every receipt must be based on verified physical counts. The legacy
    // generic status action must not bypass the counted-receipt workflow.
    if (status === "RECEIVED" && !actualReceipts) {
      throw new Error("入荷確定には現品を検数した実入荷数量が必要です");
    }

    if (status === "RECEIVED" && actualReceipts) {
      const expectedIds = new Set(po.items.map(line => line.id));
      if (Object.keys(actualReceipts).length !== expectedIds.size ||
          Object.keys(actualReceipts).some(lineId => !expectedIds.has(lineId))) {
        throw new Error("入荷明細の件数が一致しません。画面を更新してください");
      }
      const reason = discrepancyReason?.trim() || "";
      if (reason.length > 500) throw new Error("入荷差異の理由は500文字以内で入力してください");
      if (!po.items.some(line => Number.isSafeInteger(actualReceipts[line.id]) &&
          actualReceipts[line.id] > 0)) {
        throw new Error("実入荷数を1個以上入力してください");
      }
      for (const line of po.items) {
        const actual = actualReceipts[line.id];
        if (!Number.isSafeInteger(actual) || actual < line.received || actual > 100000000) {
          throw new Error("実入荷数量が正しくありません");
        }
        if (actual !== line.quantity && !reason) {
          throw new Error("発注数量と異なる入荷数には差異の理由が必要です");
        }
      }
    }

    // Conditional claim prevents repeated RECEIVE from incrementing inventory twice.
    const changed = await tx.purchaseOrder.updateMany({
      where: { id: po.id, tenantId, status: po.status },
      data: { status },
    });
    if (changed.count !== 1) throw new Error("発注が別の操作で変更されました");

    if (status === "RECEIVED") {
      for (const line of po.items) {
        const counted = actualReceipts ? actualReceipts[line.id] : line.quantity;
        const delta = counted - line.received;
        if (delta <= 0) {
          await tx.purchaseOrderItem.update({
            where: { id: line.id },
            data: { received: counted },
          });
          continue;
        }
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
            note: counted !== line.quantity
              ? `仕入入庫: ${po.poNumber}／予定${line.quantity}・実入荷${counted} ${line.unit}／差異: ${discrepancyReason?.trim() || "理由未記録"}`
              : `仕入入庫: ${po.poNumber}`,
            createdBy: userId,
          },
        });
        await tx.purchaseOrderItem.update({
          where: { id: line.id },
          data: { received: counted },
        });
      }
      if (actualReceipts && po.items.some(line => actualReceipts[line.id] !== line.quantity)) {
        await tx.purchaseOrder.update({
          where: { id: po.id, tenantId },
          data: {
            note: [po.note, `【入荷差異】${po.items.map(line =>
              `${line.itemName}:発注${line.quantity}→実入荷${actualReceipts[line.id]}${line.unit}`
            ).join("、")}／理由:${discrepancyReason?.trim()}`].filter(Boolean).join("\n"),
          },
        });
      }
    }
  });
}
