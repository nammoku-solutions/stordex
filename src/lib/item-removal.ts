import { prisma } from "@/lib/db";

/**
 * History-preserving item removal.
 * - Positive stock must be cleared through auditable inventory operations.
 * - Referenced items with no live/open workflows are retired, never deleted.
 * - Unreferenced zero-stock items may be physically deleted.
 *
 * Never delete OrderItem, PurchaseOrderItem or InventoryMovement history.
 */
export type ItemRemovalResult =
  | "removed"
  | "retired"
  | "already-retired"
  | "stock-remains"
  | "open-transactions"
  | "not-found"
  | "concurrent-change";

function foreignKeyConflict(error: unknown): boolean {
  return error instanceof Error &&
    "code" in error && error.code === "P2003";
}

export async function safelyRemoveItem(
  tenantId: string,
  id: string,
): Promise<ItemRemovalResult> {
  try {
    return await prisma.$transaction(async tx => {
      const item = await tx.item.findFirst({
        where: { id, tenantId },
        select: {
          id: true, stock: true, active: true,
          _count: {
            select: {
              orderItems: true,
              purchaseOrderItems: true,
              quotationItems: true,
              movements: true,
            },
          },
        },
      });
      if (!item) return "not-found";
      if (!item.active) return "already-retired";
      // Always protect real stock, even when there is no sales or PO history.
      if (item.stock !== 0) return "stock-remains";

      // DRAFT and in-flight orders may still create or reverse stock movements.
      const [openSales, openPurchases, openQuotes] = await Promise.all([
        tx.orderItem.count({
          where: {
            itemId: id,
            order: { tenantId, status: { in: ["DRAFT", "CONFIRMED", "SHIPPED"] } },
          },
        }),
        tx.purchaseOrderItem.count({
          where: {
            itemId: id,
            purchaseOrder: { tenantId, status: { in: ["DRAFT", "ORDERED"] } },
          },
        }),
        tx.quotationItem.count({
          where: {
            itemId: id,
            quotation: { tenantId, status: { in: ["DRAFT", "SENT", "ACCEPTED"] } },
          },
        }),
      ]);
      if (openSales || openPurchases || openQuotes) return "open-transactions";

      const referenced = item._count.orderItems +
        item._count.purchaseOrderItems +
        item._count.quotationItems + item._count.movements > 0;

      if (referenced) {
        const updated = await tx.item.updateMany({
          where: { id, tenantId, active: true, stock: 0 },
          data: { active: false },
        });
        return updated.count === 1 ? "retired" : "concurrent-change";
      }
      const deleted = await tx.item.deleteMany({
        where: { id, tenantId, stock: 0, active: true },
      });
      return deleted.count === 1 ? "removed" : "concurrent-change";
    }, { isolationLevel: "Serializable", timeout: 10000 });
  } catch (error) {
    // A newly inserted foreign-key reference must not crash the entire page
    // or cause us to silently delete operational order history.
    if (foreignKeyConflict(error)) return "concurrent-change";
    throw error;
  }
}
