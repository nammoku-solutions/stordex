import { describe, expect, it } from "vitest";
import {
  jstStartOfDate,
  nextJstDate,
  summarizeInventory,
  todayInJapan,
  type InventoryItem,
  type MovementSum,
} from "./inventory-history";

const item: InventoryItem = {
  id: "item-1",
  code: "P001",
  name: "商品A",
  unit: "個",
  stock: 12,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

function movement(type: MovementSum["type"], quantity: number): MovementSum {
  return { itemId: item.id, type, _sum: { quantity } };
}

describe("inventory history", () => {
  it("reconstructs an end-of-day balance from later movements", () => {
    const rows = summarizeInventory(
      [item],
      [movement("INBOUND", 5), movement("OUTBOUND", 2)],
      [],
      new Date("2026-10-02T15:00:00Z"),
    );
    expect(rows[0].closing).toBe(9);
    expect(rows[0].opening).toBe(9);
  });

  it("reconstructs opening, closing and period flows", () => {
    const rows = summarizeInventory(
      [item],
      [movement("INBOUND", 2)],
      [movement("INBOUND", 10), movement("OUTBOUND", 4), movement("ADJUSTMENT", -3)],
      new Date("2026-10-05T15:00:00Z"),
      new Date("2026-10-01T15:00:00Z"),
    );
    expect(rows[0]).toMatchObject({
      opening: 7, inbound: 10, outbound: 4, adjustment: -3, net: 3, closing: 10,
    });
  });

  it("flags products added within the selected period", () => {
    const rows = summarizeInventory(
      [{ ...item, createdAt: new Date("2026-10-03T00:00:00Z") }],
      [],
      [],
      new Date("2026-10-05T15:00:00Z"),
      new Date("2026-10-01T15:00:00Z"),
    );
    expect(rows[0].opening).toBeNull();
    expect(rows[0].createdDuringPeriod).toBe(true);
  });

  it("excludes products that did not exist at the cutoff", () => {
    expect(summarizeInventory(
      [{ ...item, createdAt: new Date("2026-10-06T00:00:00Z") }],
      [], [], new Date("2026-10-05T15:00:00Z"),
    )).toEqual([]);
  });

  it("parses strict Japanese calendar dates", () => {
    expect(jstStartOfDate("2026-10-16")?.toISOString()).toBe("2026-10-15T15:00:00.000Z");
    expect(nextJstDate(jstStartOfDate("2026-10-16")!).toISOString())
      .toBe("2026-10-16T15:00:00.000Z");
    expect(jstStartOfDate("2026-02-30")).toBeNull();
    expect(jstStartOfDate("2026-13-01")).toBeNull();
    expect(jstStartOfDate("today")).toBeNull();
    expect(todayInJapan(new Date("2026-10-15T15:00:00Z"))).toBe("2026-10-16");
  });
});
