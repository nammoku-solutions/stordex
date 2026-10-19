/** Base-unit inventory policy logic shared by dashboard and inventory screens. */
export type InventoryPolicyItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  stock: number;
  stockPolicy: "STOCKED" | "ON_DEMAND";
  reorderPoint: number;
};

export function belowMinimumStock(items: readonly InventoryPolicyItem[]) {
  return items.filter(item =>
    item.stockPolicy === "STOCKED" &&
    item.reorderPoint > 0 &&
    item.stock < item.reorderPoint
  );
}

export function onDemandRemaining(
  items: readonly InventoryPolicyItem[],
  draftDemand: ReadonlyMap<string, number> = new Map(),
) {
  return items.filter(item => item.stockPolicy === "ON_DEMAND" && item.stock > 0)
    .map(item => {
      const pending = Math.max(0, draftDemand.get(item.id) || 0);
      return {
        ...item,
        pendingDraftUnits: pending,
        estimatedAvailable: Math.max(0, item.stock - pending),
      };
    });
}
