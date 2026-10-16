import { beforeEach, describe, expect, it, vi } from "vitest";
import { toCsv } from "@/lib/csv-export";
import { parseCsv, decodeCsvBuffer } from "./parse";
import { autoMap, coerceValue } from "./schema";

const mocks = vi.hoisted(() => ({
  lookupOrder: vi.fn(),
  lookupCustomer: vi.fn(),
  lookupItem: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    order: { findUnique: mocks.lookupOrder },
    customer: { findUnique: mocks.lookupCustomer },
    item: { findUnique: mocks.lookupItem },
    $transaction: mocks.transaction,
  },
}));
import { runImport } from "./import";

const headers = [
  "orderNumber", "customerCode", "customerName", "orderDate", "dueDate",
  "itemCode", "itemName", "unit", "quantity", "unitPrice", "taxRate",
];
const mkrow = (item: string, qty = "2", customer = "CUS-A", tax = "8") =>
  ["SO-101", customer, "顧客,株式会社", "2026-10-17", "2026-10-20",
   item, "コピー用紙", "箱", qty, "1,000", tax];
const load = (rows: string[][]) => {
  const exported = toCsv(headers, rows);
  const text = decodeCsvBuffer(new TextEncoder().encode(exported)).text;
  const parsed = parseCsv(text);
  return {
    tenantId: "sample-tenant",
    rows: parsed,
    config: {
      target: "ORDER" as const,
      mapping: autoMap("ORDER", parsed[0]),
      headerRow: 0,
      skipRows: 0,
      upsertMode: "skip" as const,
    },
    dryrun: true as const,
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookupOrder.mockResolvedValue(null);
  mocks.lookupCustomer.mockResolvedValue({ id: "customer-local" });
  mocks.lookupItem.mockImplementation(async ({ where }: { where: { tenantId_code: { code: string } } }) => ({
    id: "item-local-" + where.tenantId_code.code,
    name: "コピー用紙", unit: "箱", spec: "A4",
    origin: null, costPrice: 300,
  }));
});

describe("Stordex export/import sales-order round-trip", () => {
  it("maps exported headers, preserves UTF-8 and creates one order from two lines with 8% tax", async () => {
    const rows = [mkrow("A-PAPER"), mkrow("A-PAPER", "3")];
    const opts = load(rows);
    expect(opts.rows.length).toBe(3);
    expect(opts.rows[1][2]).toBe("顧客,株式会社");
    expect(opts.config.mapping).toMatchObject({
      orderNumber: "orderNumber", customerCode: "customerCode",
      itemCode: "itemCode", quantity: "quantity", taxRate: "taxRate",
    });
    const result = await runImport(opts);
    expect(result).toMatchObject({
      rowCount: 2, createdCount: 1, errorCount: 0,
      samples: [{ orderNumber: "SO-101", lines: 2, total: 5400 }],
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects the whole order if even one line fails type coercion", async () => {
    const invalid = mkrow("A-PAPER", "not-a-number");
    const result = await runImport(load([mkrow("A-PAPER"), invalid]));
    expect(result.createdCount).toBe(0);
    expect(result.errorCount).toBe(2);
    expect(result.errors.map(e => e.row)).toEqual([3, 2]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects the whole order when lines disagree on customer or tax rate", async () => {
    const result = await runImport(load([
      mkrow("A-PAPER"),
      mkrow("A-PAPER", "2", "CUS-OTHER", "10"),
    ]));
    expect(result.createdCount).toBe(0);
    expect(result.errorCount).toBe(2);
    expect(mocks.lookupOrder).not.toHaveBeenCalled();
  });

  it("rejects invalid tax rates, without creating the order", async () => {
    const result = await runImport(load([mkrow("A-PAPER", "1", "CUS-A", "101")]));
    expect(result.createdCount).toBe(0);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].reason).toContain("消費税率");
  });

  it("rejects mismatched inventory units without creating partial orders", async () => {
    const opts = load([mkrow("A-PAPER"), mkrow("A-PAPER", "2")]);
    const unitIndex = opts.rows[0].indexOf("unit");
    opts.rows[2][unitIndex] = "本";
    const result = await runImport(opts);
    expect(result).toMatchObject({createdCount:0,errorCount:1});
    expect(result.errors[0].reason).toContain("単位");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not evaluate text formula cells when exporting", () => {
    const csv = toCsv(["code", "name"], [["=1+1", "+HYPERLINK()"]]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'+HYPERLINK()");
  });

  it("preserves valid Japanese dates but rejects impossible calendar dates", () => {
    expect(coerceValue("2026-02-29", "date").ok).toBe(false);
    expect(coerceValue("2024-02-29", "date").ok).toBe(true);
  });
});
