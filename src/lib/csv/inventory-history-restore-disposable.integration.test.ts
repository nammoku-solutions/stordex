import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { toCsv, type CsvCell } from "@/lib/csv-export";
import { decodeCsvBuffer, parseCsv } from "./parse";
import {
  ITEM_MIGRATION_EXPORT_HEADERS,
  MOVEMENT_MIGRATION_EXPORT_HEADERS,
} from "./inventory-ledger-preflight";

const url = process.env.DATABASE_URL ?? "";
const isolated = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?schema=public)?$/.test(url);

const exportedItem = {
  code: "CI-LEDGER-ITEM", name: "在庫履歴テスト", stock: 15,
  stockPolicy: "STOCKED", purchaseMode: "UNIT",
};
const noHistory = {
  code: "CI-NO-HISTORY", name: "履歴なし・開始残高不明", stock: 9,
  stockPolicy: "ON_DEMAND", purchaseMode: "UNIT",
};
const movementBase = {
  movementId: "source-m-001", createdAt: "2026-11-01T00:00:00.000Z",
  itemCode: exportedItem.code, itemName: exportedItem.name,
  type: "INBOUND", quantity: 10, balance: 20, warehouseCode: "W-TEST",
  lotNumber: "LOT-1", expiryDate: "2026-12-31", location: "A-1",
  reference: "PO-EXPORTED", note: "入荷",
};
type CsvInput = Record<string, CsvCell>;
const row = (headers: readonly string[], source: CsvInput) =>
  headers.map(header => source[header] ?? "");
function csvRows(headers: readonly string[], sources: CsvInput[]) {
  const text = toCsv([...headers], sources.map(source => row(headers, source)));
  return parseCsv(decodeCsvBuffer(new TextEncoder().encode(text)).text);
}
const items = () => csvRows(ITEM_MIGRATION_EXPORT_HEADERS, [exportedItem, noHistory]);
const movements = (changed: Partial<typeof movementBase> = {}) =>
  csvRows(MOVEMENT_MIGRATION_EXPORT_HEADERS, [
    { ...movementBase, ...changed },
    { ...movementBase, movementId: "source-m-002",
      createdAt: "2026-11-02T00:00:00.000Z", type: "OUTBOUND",
      quantity: 7, balance: 13, warehouseCode: "", lotNumber: "",
      expiryDate: "", location: "", reference: "ORDER-1", note: "出荷" },
    { ...movementBase, movementId: "source-m-003",
      createdAt: "2026-11-03T00:00:00.000Z", type: "ADJUSTMENT",
      quantity: 2, balance: 15, warehouseCode: "",
      lotNumber: "", expiryDate: "", location: "", reference: "",
      note: "棚卸し差異" },
  ]);

describe("disposable-only historic inventory ledger migration", () => {
  it.runIf(isolated)("persists exactly once without replay, preserves source balances and rejects unsafe conditions", async () => {
    const { prisma } = await import("@/lib/db");
    const { restoreInventoryHistoryInDisposableCi } =
      await import("./inventory-history-restore-disposable");
    const suffix = randomUUID().slice(0, 10);
    const tenant = await prisma.tenant.create({
      data: { slug: "ci-historical-ledger-" + suffix, name: "History Rehearsal" },
    });
    const other = await prisma.tenant.create({
      data: { slug: "ci-historical-other-" + suffix, name: "Other Tenant" },
    });
    try {
      const item = await prisma.item.create({
        data: { tenantId: tenant.id, code: exportedItem.code,
          name: exportedItem.name, stock: 15 },
      });
      await prisma.item.create({
        data: { tenantId: tenant.id, code: noHistory.code,
          name: noHistory.name, stock: 9 },
      });
      const otherItem = await prisma.item.create({
        data: { tenantId: other.id, code: exportedItem.code,
          name: "Other tenant's item", stock: 777 },
      });
      await prisma.warehouse.create({
        data: { tenantId: tenant.id, code: "W-TEST", name: "Test Warehouse" },
      });
      const before = {
        itemStock: (await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).stock,
        otherStock: (await prisma.item.findUniqueOrThrow({ where: { id: otherItem.id } })).stock,
      };
      const input = { tenantId: tenant.id, itemRows: items(), movementRows: movements() };
      const first = await restoreInventoryHistoryInDisposableCi(input);
      expect(first).toEqual({
        itemCount: 2, sourceMovements: 3, created: 3,
        skippedIdentical: 0, currentStockUpdates: 0, noHistoryItems: 1,
      });
      const persisted = await prisma.inventoryMovement.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      expect(persisted).toHaveLength(3);
      expect(persisted.map(p => [p.type, p.quantity, p.balance])).toEqual([
        ["INBOUND", 10, 20], ["OUTBOUND", 7, 13],
        ["ADJUSTMENT", 2, 15],
      ]);
      expect(persisted[0].id).toMatch(/^hist_[a-f0-9]{48}$/);
      expect(persisted[0].lotNumber).toBe("LOT-1");
      expect(persisted[0].expiryDate?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
      expect(persisted[0].createdAt.toISOString()).toBe("2026-11-01T00:00:00.000Z");
      expect(persisted[0].warehouseId).toBeTruthy();
      expect(await prisma.inventoryMovement.count({
        where: { tenantId: other.id },
      })).toBe(0);
      expect(await prisma.inventoryMovement.count({
        where: { tenantId: tenant.id, item: { code: noHistory.code } },
      })).toBe(0);

      const replay = await restoreInventoryHistoryInDisposableCi(input);
      expect(replay).toMatchObject({
        created: 0, skippedIdentical: 3, currentStockUpdates: 0,
      });

      // Identical source IDs with changed records cannot silently overwrite.
      await expect(restoreInventoryHistoryInDisposableCi({
        ...input, movementRows: movements({ note: "tampered" }),
      })).rejects.toThrow("別内容");
      // Warehouse codes are only resolved inside this tenant.
      await expect(restoreInventoryHistoryInDisposableCi({
        ...input, movementRows: movements({ warehouseCode: "OTHER-WAREHOUSE" }),
      })).rejects.toThrow("倉庫コード");
      // Do not overwrite the cutover stock snapshot even if the source ledger agrees.
      await prisma.item.update({ where: { id: item.id }, data: { stock: 100 } });
      await expect(restoreInventoryHistoryInDisposableCi(input))
        .rejects.toThrow("現在庫");
      await prisma.item.update({ where: { id: item.id }, data: { stock: 15 } });

      const after = {
        itemStock: (await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).stock,
        otherStock: (await prisma.item.findUniqueOrThrow({ where: { id: otherItem.id } })).stock,
      };
      expect(after).toEqual(before);
      expect(await prisma.inventoryMovement.count({ where: { tenantId: tenant.id } })).toBe(3);

      // The environment check must happen before ANY database query.
      const savedAppEnv = process.env.APP_ENV;
      process.env.APP_ENV = "staging";
      try {
        await expect(restoreInventoryHistoryInDisposableCi(input))
          .rejects.toThrow("disabled outside disposable CI");
      } finally {
        process.env.APP_ENV = savedAppEnv;
      }
    } finally {
      await prisma.inventoryMovement.deleteMany({
        where: { tenantId: { in: [tenant.id, other.id] } },
      });
      await prisma.warehouse.deleteMany({
        where: { tenantId: { in: [tenant.id, other.id] } },
      });
      await prisma.item.deleteMany({
        where: { tenantId: { in: [tenant.id, other.id] } },
      });
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenant.id, other.id] } },
      });
    }
  });
});
