import { prisma } from "@/lib/db";
import {
  ManualInventoryError,
  MAX_INVENTORY_STOCK,
  type ManualInventoryInput,
} from "./manual-inventory-input";

/**
 * Record a manual stock movement and its signed ledger delta atomically.
 * This uses an optimistic stock compare-and-swap inside SERIALIZABLE to avoid
 * losing order/receipt updates or writing a balance from a stale read.
 */
export async function applyManualInventoryMovement(
  input: ManualInventoryInput & { tenantId: string; userId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const item = await tx.item.findFirst({
      where: { id: input.itemId, tenantId: input.tenantId, active: true },
      select: { id: true, stock: true },
    });
    if (!item) {
      throw new ManualInventoryError("商品が見つからないか、すでに取扱停止になっています");
    }

    let next: number;
    if (input.type === "INBOUND") next = item.stock + input.quantity;
    else if (input.type === "OUTBOUND") next = item.stock - input.quantity;
    else next = input.quantity;

    if (next < 0) {
      throw new ManualInventoryError("現在庫を超える出庫はできません。最新の在庫を確認してください");
    }
    if (!Number.isSafeInteger(next) || next > MAX_INVENTORY_STOCK) {
      throw new ManualInventoryError("在庫数量が登録できる上限を超えています");
    }
    if (input.type === "ADJUSTMENT" && next === item.stock) {
      throw new ManualInventoryError("棚卸後の数量が現在庫と同じです。変更は記録されません");
    }

    const claimed = await tx.item.updateMany({
      where: {
        id: item.id, tenantId: input.tenantId, active: true, stock: item.stock,
      },
      data: { stock: next },
    });
    if (claimed.count !== 1) {
      throw new ManualInventoryError("在庫が別の操作で更新されました。画面を更新して再確認してください");
    }

    const signedDelta = input.type === "OUTBOUND"
      ? -input.quantity
      : input.type === "INBOUND"
        ? input.quantity
        : next - item.stock;

    await tx.inventoryMovement.create({
      data: {
        tenantId: input.tenantId,
        itemId: item.id,
        type: input.type,
        // OUTBOUND stores positive movement count, ADJUSTMENT stores signed delta.
        quantity: input.type === "OUTBOUND" ? input.quantity : signedDelta,
        balance: next,
        reference: input.reference,
        note: input.note,
        createdBy: input.userId,
      },
    });
  }, { isolationLevel: "Serializable", timeout: 10000 });
}
