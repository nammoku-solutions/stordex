import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv-export";
import { parseCsv, decodeCsvBuffer } from "./parse";
import {
  ITEM_MIGRATION_EXPORT_HEADERS,
  MOVEMENT_MIGRATION_EXPORT_HEADERS,
  preflightInventoryLedgerExports,
} from "./inventory-ledger-preflight";

type Field = string | number | boolean | null;
const stockItem = {
  code: "STOCK-01", name: "在庫品A",
  stock: 15, stockPolicy: "STOCKED", purchaseMode: "UNIT",
};
const movement = {
  movementId: "m-001",
  createdAt: "2026-11-01T00:00:00.000Z",
  itemCode: "STOCK-01", itemName: "在庫品A",
  type: "INBOUND", quantity: 10, balance: 20,
  warehouseCode: "", lotNumber: "", expiryDate: "",
  location: "", reference: "PO-1", note: "",
};
// Preserve numeric cell types exactly as the real exporter does. In particular,
 // a negative ADJUSTMENT is exported as a number; serializing it as text would
 // intentionally trigger CSV formula-injection protection and change the value.
const item = (changes: Record<string, Field> = {}) =>
  ITEM_MIGRATION_EXPORT_HEADERS.map(k =>
    (changes[k] ?? (stockItem as Record<string, Field>)[k]) ?? "",
  );
const ledger = (changes: Record<string, Field> = {}) =>
  MOVEMENT_MIGRATION_EXPORT_HEADERS.map(k =>
    (changes[k] ?? (movement as Record<string, Field>)[k]) ?? "",
  );

function fromExport(rows: Field[][], headers: readonly string[]) {
  const csv = toCsv([...headers], rows);
  return parseCsv(decodeCsvBuffer(new TextEncoder().encode(csv)).text);
}
function check(itemRows: Field[][], movementRows: Field[][]) {
  return preflightInventoryLedgerExports({
    items: fromExport(itemRows, ITEM_MIGRATION_EXPORT_HEADERS),
    movements: fromExport(movementRows, MOVEMENT_MIGRATION_EXPORT_HEADERS),
  });
}

describe("inventory ledger and current-stock CSV reconciliation", () => {
  it("infers opening, applies inbound/outbound/signed adjustment, matches last balance", () => {
    const output = check([item(),item({code:"NO-HISTORY",name:"履歴なし",stock:9})], [
      ledger(), ledger({movementId:"m-002",createdAt:"2026-11-02T00:00:00.000Z",
        type:"OUTBOUND",quantity:7,balance:13}),
      ledger({movementId:"m-003",createdAt:"2026-11-03T00:00:00.000Z",
        type:"ADJUSTMENT",quantity:2,balance:15}),
    ]);
    expect(output).toMatchObject({
      ok:true,itemCount:2,movementCount:3,reconciledItems:1,
      unverifiedItems:1,sourceStockTotal:24,openingStockTotal:10,errors:[],
    });
    expect(output.warnings).toHaveLength(1);
    expect(output.summaries[0]).toMatchObject({
      code:"STOCK-01",movementCount:3,lastBalance:15,inferredOpening:10,
    });
  });

  it("permits a negative inventory adjustment when the ledger still balances", () => {
    const output=check([item({stock:12})], [
      ledger(),ledger({movementId:"m-002",createdAt:"2026-11-02T00:00:00.000Z",
        type:"ADJUSTMENT",quantity:-8,balance:12}),
    ]);
    expect(output.ok).toBe(true);
    expect(output.openingStockTotal).toBe(10);
  });

  it("rejects a mismatch between the item current stock and the final movement balance", () => {
    const output=check([item({stock:19})],[ledger()]);
    expect(output.ok).toBe(false);
    expect(output.errors.some(e=>e.field==="stock")).toBe(true);
    expect(output.summaries).toEqual([]);
  });

  it("rejects a discontinuity within a SKU even when its final balance matches", () => {
    const output=check([item({stock:15})],[
      ledger(),
      ledger({movementId:"m-002",createdAt:"2026-11-02T00:00:00.000Z",
        type:"OUTBOUND",quantity:8,balance:15}),
    ]);
    expect(output.ok).toBe(false);
    expect(output.errors.some(e=>e.field==="balance")).toBe(true);
  });

  it("rejects unknown item codes and duplicate movement IDs", () => {
    const r=check([item()],[
      ledger({itemCode:"UNKNOWN"}),
      ledger({movementId:"m-001",createdAt:"2026-11-02T00:00:00.000Z"}),
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors.some(x=>x.field==="itemCode")).toBe(true);
    expect(r.errors.some(x=>x.field==="movementId")).toBe(true);
  });

  it("rejects impossible dates, negative source stock, zero outbound and noninteger quantities", () => {
    expect(check([item({stock:-1})],[]).ok).toBe(false);
    expect(check([item()], [ledger({createdAt:"2026-11-31T00:00:00.000Z"})]).ok).toBe(false);
    expect(check([item()], [ledger({type:"OUTBOUND",quantity:0})]).ok).toBe(false);
    expect(check([item()], [ledger({quantity:"1.5"})]).ok).toBe(false);
    expect(check([item()], [ledger({expiryDate:"2026-02-30"})]).ok).toBe(false);
  });

  it("rejects out-of-range PostgreSQL int4 values before creating a cutover manifest", () => {
    const max = 2_147_483_647;
    const min = -2_147_483_648;
    const within = check([item({ stock: max })], []);
    expect(within.ok).toBe(true);
    expect(check([item({ stock: max + 1 })], []).errors
      .some(error => error.field === "stock")).toBe(true);

    const excessBalance = check([item()], [ledger({ balance: max + 1 })]);
    expect(excessBalance.errors.some(error => error.field === "balance")).toBe(true);

    const excessQuantity = check([item()], [ledger({ quantity: max + 1 })]);
    expect(excessQuantity.errors.some(error => error.field === "quantity")).toBe(true);

    const tooNegativeAdjustment = check([item()], [ledger({
      type: "ADJUSTMENT", quantity: min - 1,
    })]);
    expect(tooNegativeAdjustment.errors.some(error => error.field === "quantity")).toBe(true);

    // A historical opening value cannot exceed the database column range,
    // even if the final balance and individual movement quantity fit int4.
    const openingOverflow = check([item({ stock: max })], [ledger({
      type: "OUTBOUND", quantity: 1, balance: max,
    })]);
    expect(openingOverflow.ok).toBe(false);
    expect(openingOverflow.errors.some(error => error.field === "balance")).toBe(true);
  });

  it("rejects reversed global movement ordering", () => {
    const r=check([item()],[
      ledger({movementId:"m-002",createdAt:"2026-11-02T00:00:00.000Z"}),
      ledger({movementId:"m-001",createdAt:"2026-11-01T00:00:00.000Z"}),
    ]);
    expect(r.errors.some(x=>x.field==="createdAt")).toBe(true);
  });

  it("rejects duplicate item codes and mismatching header sets", () => {
    const r=check([item(),item()],[]);
    expect(r.errors.some(x=>x.field==="code")).toBe(true);
    const invalid=preflightInventoryLedgerExports({
      items:[["code","name"]],movements:[[...MOVEMENT_MIGRATION_EXPORT_HEADERS]],
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.errors[0].field).toBe("header");
  });

  it("accepts entirely empty movement history as unverified source stock", () => {
    const r=check([item()],[]);
    expect(r.ok).toBe(true);
    expect(r.itemCount).toBe(1);
    expect(r.movementCount).toBe(0);
    expect(r.unverifiedItems).toBe(1);
    expect(r.warnings.length).toBe(1);
  });

  it("rejects a source exceeding 10,000 movement rows", () => {
    const many=preflightInventoryLedgerExports({
      items:[[...ITEM_MIGRATION_EXPORT_HEADERS],item().map(String)],
      movements:[[...MOVEMENT_MIGRATION_EXPORT_HEADERS],
        ...Array.from({length:10001},()=>ledger().map(String))],
    });
    expect(many.ok).toBe(false);
    expect(many.errors.some(x=>x.field==="rows")).toBe(true);
  });
});
