import { describe, expect, it } from "vitest";
import { toCsv, type CsvCell } from "@/lib/csv-export";
import { PURCHASE_ORDER_EXPORT_HEADERS } from "./purchase-order-preflight";
import { canonicalArchiveJson, preparePurchaseOrderArchive } from "./purchase-order-archive";

const source: Record<string, CsvCell> = {
  poNumber: "CI-PO-001",
  supplierCode: "S-1",
  supplierName: "仕入先",
  orderDate: "2026-11-03",
  pickupDate: "",
  status: "RECEIVED",
  note: "保存対象",
  taxRate: 10,
  subtotal: 500,
  tax: 50,
  total: 550,
  itemCode: "HIST-SKU",
  itemName: "履歴商品",
  unit: "個",
  quantity: 5,
  unitPrice: 100,
  amount: 500,
  received: 5,
  packSize: "",
  packCount: "",
  packUnit: "",
  createdAt: "2026-11-03T00:00:00.000Z",
  updatedAt: "2026-11-03T00:01:00.000Z",
};

function csv(rows: Record<string, CsvCell>[] = [source]) {
  return new TextEncoder().encode(
    toCsv([...PURCHASE_ORDER_EXPORT_HEADERS],
      rows.map(row => PURCHASE_ORDER_EXPORT_HEADERS.map(key => row[key] ?? ""))),
  );
}

describe("isolated immutable PO archive preparation (no ORM)", () => {
  it("validates exact source bytes and stores historical lines without changing stock", () => {
    const first = preparePurchaseOrderArchive({ csv: csv(), itemCodes: ["HIST-SKU"] });
    expect(first.sourceCsvSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.documents).toHaveLength(1);
    expect(first.documents[0]).toMatchObject({
      sourcePoNumber: "CI-PO-001",
      snapshot: { poNumber: "CI-PO-001", total: 550, lines: [{
        itemCode: "HIST-SKU", quantity: 5, received: 5,
      }] },
    });
    expect(first.documents[0].sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.warnings).toBe(0);
  });

  it("uses canonical JSON irrespective of PostgreSQL jsonb object key order", () => {
    const a = { poNumber: "CI-PO-001", lines: [{ itemCode: "A", quantity: 2 }] };
    const b = { lines: [{ quantity: 2, itemCode: "A" }], poNumber: "CI-PO-001" };
    expect(canonicalArchiveJson(a)).toBe(canonicalArchiveJson(b));
    expect(canonicalArchiveJson({ ...a, lines: [{ itemCode: "A", quantity: 3 }] }))
      .not.toBe(canonicalArchiveJson(a));
  });

  it("rejects unknown SKUs, broken totals, and malformed UTF-8 before any DB access", () => {
    expect(() => preparePurchaseOrderArchive({
      csv: csv(), itemCodes: ["OTHER-SKU"],
    })).toThrow("商品マスタに存在しない");
    expect(() => preparePurchaseOrderArchive({
      csv: csv([{ ...source, amount: 999 }]), itemCodes: ["HIST-SKU"],
    })).toThrow("FAIL");
    expect(() => preparePurchaseOrderArchive({
      csv: new Uint8Array([0xff, 0xfe]), itemCodes: ["HIST-SKU"],
    })).toThrow();
  });

  it("refuses to silently interpret overreceipt as reconciled receipt", () => {
    const prepared = preparePurchaseOrderArchive({
      csv: csv([{ ...source, received: 7 }]), itemCodes: ["HIST-SKU"],
    });
    expect(prepared.warnings).toBeGreaterThan(0);
    expect(prepared.documents[0].snapshot.lines[0].received).toBe(7);
  });

  it("accepts a well-formed empty PO export and fingerprints its exact bytes", () => {
    const prepared = preparePurchaseOrderArchive({
      csv: csv([]), itemCodes: ["HIST-SKU"],
    });
    expect(prepared.documents).toEqual([]);
    expect(prepared.sourceCsvSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
