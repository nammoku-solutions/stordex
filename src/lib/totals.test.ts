import { describe, it, expect } from "vitest";
import { computeTotals, nextSequentialNumber } from "./totals";

describe("computeTotals", () => {
  it("空行は subtotal/tax/total すべて 0", () => {
    const r = computeTotals([], 10);
    expect(r.subtotal).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.total).toBe(0);
  });

  it("単一行: 数量×単価 = amount, 10% 税", () => {
    const r = computeTotals([{ quantity: 3, unitPrice: 100 }], 10);
    expect(r.lines[0].amount).toBe(300);
    expect(r.subtotal).toBe(300);
    expect(r.tax).toBe(30);
    expect(r.total).toBe(330);
  });

  it("複数行は合算される", () => {
    const r = computeTotals(
      [
        { quantity: 2, unitPrice: 150 },
        { quantity: 1, unitPrice: 700 },
      ],
      10
    );
    expect(r.subtotal).toBe(1000);
    expect(r.tax).toBe(100);
    expect(r.total).toBe(1100);
  });

  it("税の端数は切り捨て (floor)", () => {
    const r = computeTotals([{ quantity: 1, unitPrice: 199 }], 10);
    expect(r.subtotal).toBe(199);
    expect(r.tax).toBe(19); // 19.9 → 19
    expect(r.total).toBe(218);
  });

  it("税率 0 は税 0", () => {
    const r = computeTotals([{ quantity: 1, unitPrice: 1000 }], 0);
    expect(r.tax).toBe(0);
    expect(r.total).toBe(1000);
  });

  it("負の値は例外", () => {
    expect(() => computeTotals([{ quantity: -1, unitPrice: 100 }], 10)).toThrow();
    expect(() => computeTotals([{ quantity: 1, unitPrice: -1 }], 10)).toThrow();
    expect(() => computeTotals([], -1)).toThrow();
  });
});

describe("nextSequentialNumber", () => {
  const date = new Date(2026, 3, 26); // 2026/04/26

  it("既存なし → 0001", () => {
    expect(nextSequentialNumber("SO", date, null)).toBe("SO-20260426-0001");
  });

  it("既存あり → 次番号", () => {
    expect(nextSequentialNumber("SO", date, "SO-20260426-0007")).toBe(
      "SO-20260426-0008"
    );
  });

  it("プレフィックスや日付が違う既存は無視 → 0001", () => {
    expect(nextSequentialNumber("SO", date, "Q-20260425-0099")).toBe(
      "SO-20260426-0001"
    );
  });

  it("4桁ゼロ埋め", () => {
    expect(nextSequentialNumber("SO", date, "SO-20260426-0099")).toBe(
      "SO-20260426-0100"
    );
  });
});
