/**
 * Reconstruct stock from the current stock and the signed movements after a cutoff.
 * All changes must be recorded in InventoryMovement for historical values to be exact.
 */
export type MovementKind = "INBOUND" | "OUTBOUND" | "ADJUSTMENT";
export type MovementSum = {
  itemId: string;
  type: MovementKind;
  _sum: { quantity: number | null };
};
export type InventoryItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  stock: number;
  createdAt: Date;
};
export type HistoricalInventoryRow = {
  id: string;
  code: string;
  name: string;
  unit: string;
  opening: number | null;
  inbound: number;
  outbound: number;
  adjustment: number;
  closing: number;
  net: number;
  createdDuringPeriod: boolean;
};

function signedChange(movement: MovementSum): number {
  const quantity = movement._sum.quantity ?? 0;
  return movement.type === "OUTBOUND" ? -quantity : quantity;
}

function sumByItem(groups: MovementSum[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const group of groups) {
    map.set(group.itemId, (map.get(group.itemId) ?? 0) + signedChange(group));
  }
  return map;
}

export function summarizeInventory(
  items: InventoryItem[],
  afterCutoff: MovementSum[],
  inPeriod: MovementSum[],
  cutoffExclusive: Date,
  periodStart?: Date,
): HistoricalInventoryRow[] {
  const laterChanges = sumByItem(afterCutoff);
  const periodChanges = sumByItem(inPeriod);
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  const adjustment = new Map<string, number>();

  for (const m of inPeriod) {
    const target =
      m.type === "INBOUND" ? inbound : m.type === "OUTBOUND" ? outbound : adjustment;
    target.set(m.itemId, (target.get(m.itemId) ?? 0) + (m._sum.quantity ?? 0));
  }

  return items
    .filter((item) => item.createdAt < cutoffExclusive)
    .map((item) => {
      const closing = item.stock - (laterChanges.get(item.id) ?? 0);
      const net = periodChanges.get(item.id) ?? 0;
      const createdDuringPeriod = !!periodStart && item.createdAt >= periodStart;
      return {
        id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        opening: createdDuringPeriod ? null : closing - net,
        inbound: inbound.get(item.id) ?? 0,
        outbound: outbound.get(item.id) ?? 0,
        adjustment: adjustment.get(item.id) ?? 0,
        closing,
        net,
        createdDuringPeriod,
      };
    });
}

/** Date-only input is always treated as a Japanese calendar date, not server time. */
export function jstStartOfDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() + 1 !== month ||
    utc.getUTCDate() !== day
  ) return null;
  return new Date(utc.getTime() - 9 * 60 * 60 * 1000);
}

export function nextJstDate(start: Date): Date {
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function todayInJapan(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return value("year") + "-" + value("month") + "-" + value("day");
}
