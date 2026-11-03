import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv-export";
import { decodeCsvBuffer, parseCsv } from "@/lib/csv/parse";
import {
  PURCHASE_ORDER_EXPORT_HEADERS,
  preflightPurchaseOrderExport,
} from "./purchase-order-preflight";

type Cell = string | number | null;
const values: Record<(typeof PURCHASE_ORDER_EXPORT_HEADERS)[number], Cell> = {
  poNumber: "P-20261103-0001",
  supplierCode: "S-101",
  supplierName: "東京,仕入株式会社",
  orderDate: "2026-11-03",
  pickupDate: "",
  status: "RECEIVED",
  note: "通常入荷",
  taxRate: 10,
  subtotal: 2000,
  tax: 200,
  total: 2200,
  itemCode: "PAPER",
  itemName: "A4紙",
  unit: "個",
  quantity: 20,
  unitPrice: 100,
  amount: 2000,
  received: 20,
  packSize: 10,
  packCount: 2,
  packUnit: "箱",
  createdAt: "2026-11-03T01:00:00.000Z",
  updatedAt: "2026-11-03T02:00:00.000Z",
};
const mkRow = (overrides: Partial<typeof values> = {}): string[] =>
  PURCHASE_ORDER_EXPORT_HEADERS.map(key => String(({ ...values, ...overrides })[key] ?? ""));

function importExport(rows: string[][]) {
  const csv = toCsv([...PURCHASE_ORDER_EXPORT_HEADERS], rows);
  const parsed = parseCsv(decodeCsvBuffer(new TextEncoder().encode(csv)).text);
  return preflightPurchaseOrderExport(parsed);
}

describe("read-only purchase-order CSV export preflight", () => {
  it("validates exact export schema, Japanese quoted names and base-unit pack snapshots", () => {
    const result = importExport([mkRow()]);
    expect(result).toMatchObject({
      ok: true,
      rowCount: 1,
      documentCount: 1,
      lineCount: 1,
      sourceTotals: { subtotal: 2000, tax: 200, total: 2200, received: 20 },
      errors: [], warnings: [],
    });
    expect(result.documents[0]).toMatchObject({
      poNumber: "P-20261103-0001", supplierName: "東京,仕入株式会社",
      lines: [{ packSize: 10, packCount: 2, packUnit: "箱", quantity: 20, received: 20 }],
    });
  });

  it("accepts two lines in one PO and never double-counts its monetary header", () => {
    const a = mkRow({ quantity: 10, amount: 1000, received: 10, packCount: 1 });
    const b = mkRow({
      itemCode: "PEN", itemName: "ペン", quantity: 10,
      amount: 1000, received: 10, packCount: 1,
    });
    const r = importExport([a,b]);
    expect(r.ok).toBe(true);
    expect(r.documentCount).toBe(1);
    expect(r.lineCount).toBe(2);
    expect(r.sourceTotals).toEqual({ subtotal: 2000, tax: 200, total: 2200, received: 20 });
  });

  it("rejects a changed supplier or status within the same document atomically", () => {
    const r = importExport([mkRow({ quantity:10, amount:1000, received:10, packCount:1 }),
      mkRow({ itemCode:"PEN", quantity:10, amount:1000, received:10, packCount:1, supplierCode:"S-OTHER" })]);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.field==="poNumber")).toBe(true);
    expect(r.documents).toEqual([]);
  });

  it("rejects tampered monetary totals and negative or fractional quantities", () => {
    for (const override of [
      { subtotal: 2100 }, { tax: 201 }, { total: 2201 },
      { amount: 1999 }, { quantity: "-2" }, { received: "2.5" },
    ]) {
      const r = importExport([mkRow(override)]);
      expect(r.ok).toBe(false);
      expect(r.documents).toEqual([]);
    }
  });

  it("rejects invalid pack arithmetic and incomplete pack snapshots", () => {
    for (const override of [
      { packCount: 3 }, { packUnit: "" }, { packSize: 1 }, { packCount: "" },
    ]) {
      const r = importExport([mkRow(override)]);
      expect(r.ok).toBe(false);
      expect(r.documents).toEqual([]);
    }
  });

  it("preserves historical UNIT orders with no pack snapshot", () => {
    const r = importExport([mkRow({ packSize:"", packCount:"", packUnit:"" })]);
    expect(r.ok).toBe(true);
    expect(r.documents[0].lines[0]).toMatchObject({ packSize:null, packCount:null, packUnit:null });
  });

  it("accepts explicit overreceipt but flags it for reconciliation", () => {
    const r = importExport([mkRow({ received: 21 })]);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([expect.objectContaining({field:"received",row:2})]);
  });

  it("rejects malformed dates, timestamps, duplicate headers and missing export columns", () => {
    expect(importExport([mkRow({ orderDate:"2026-02-30" })]).ok).toBe(false);
    expect(importExport([mkRow({ createdAt:"bad timestamp" })]).ok).toBe(false);
    const fields = [...PURCHASE_ORDER_EXPORT_HEADERS];
    const dupe = [...fields];dupe[1]=dupe[0];
    const result = preflightPurchaseOrderExport([dupe,mkRow()]);
    expect(result.ok).toBe(false);
    expect(result.errors[0].field).toBe("header");
    const missing = preflightPurchaseOrderExport([fields.slice(0,-1)]);
    expect(missing.ok).toBe(false);
  });

  it("rejects mismatched line column counts and over-limit input, without returning partial documents", () => {
    const r = preflightPurchaseOrderExport([
      [...PURCHASE_ORDER_EXPORT_HEADERS], mkRow(), ["short","row"],
    ]);
    expect(r.ok).toBe(false);
    expect(r.documents).toEqual([]);
    const huge = preflightPurchaseOrderExport([
      [...PURCHASE_ORDER_EXPORT_HEADERS],
      ...Array.from({length:10001},()=>mkRow()),
    ]);
    expect(huge.ok).toBe(false);
    expect(huge.errors[0].field).toBe("rows");
  });

  it("passes an empty export and reports zero documents without inventing a PO", () => {
    const r = importExport([]);
    expect(r).toMatchObject({ok:true,rowCount:0,documentCount:0,lineCount:0});
  });
});
