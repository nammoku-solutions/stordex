import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { toCsv } from "@/lib/csv-export";
import { parseCsv, decodeCsvBuffer } from "./parse";
import { PURCHASE_ORDER_EXPORT_HEADERS } from "./purchase-order-preflight";

const ciUrl = process.env.DATABASE_URL ?? "";
const disposableCi = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?|$)/.test(ciUrl);

const basic = {
  poNumber: "PO-RESTORE-001",
  supplierCode: "SUP-RESTORE",
  supplierName: "CI仕入先",
  orderDate: "2026-11-03",
  pickupDate: "",
  status: "RECEIVED",
  note: "検証入荷",
  taxRate: 10,
  subtotal: 2000,
  tax: 200,
  total: 2200,
  itemCode: "SKU-RESTORE",
  itemName: "復元する商品",
  unit: "個",
  quantity: 20,
  unitPrice: 100,
  amount: 2000,
  received: 21,
  packSize: 10,
  packCount: 2,
  packUnit: "箱",
  createdAt: "2026-11-03T01:00:00.000Z",
  updatedAt: "2026-11-03T02:00:00.000Z",
};
type CsvRow = typeof basic;
function exportRows(...documents: Partial<CsvRow>[]) {
  const body = documents.map(doc => {
    const data = { ...basic, ...doc };
    return PURCHASE_ORDER_EXPORT_HEADERS.map(column => String(data[column] ?? ""));
  });
  return parseCsv(decodeCsvBuffer(new TextEncoder().encode(
    toCsv([...PURCHASE_ORDER_EXPORT_HEADERS],body)
  )).text);
}

describe("historical purchase order restoration guarded to disposable PostgreSQL", () => {
  it.runIf(disposableCi)("restores historical PO snapshots atomically, without touching inventory, and skips identical replays", async () => {
    const { prisma } = await import("@/lib/db");
    const { restorePurchaseOrdersInDisposableCi } = await import("./purchase-order-restore-disposable");
    const suffix = randomUUID().slice(0,10);
    const tenant = await prisma.tenant.create({
      data: { slug: "ci-po-restore-" + suffix, name: "PO REHEARSAL" },
    });
    const other = await prisma.tenant.create({
      data: { slug: "ci-po-other-" + suffix, name: "OTHER" },
    });
    try {
      const supplier = await prisma.supplier.create({
        data: { tenantId: tenant.id, code: basic.supplierCode, name: basic.supplierName },
      });
      const item = await prisma.item.create({
        data: { tenantId: tenant.id, code: basic.itemCode,
          name: basic.itemName, stock: 45, purchaseMode: "PACK",
          caseQty: 10, orderUnit: "箱" },
      });
      await prisma.supplier.create({
        data: { tenantId: other.id, code: basic.supplierCode, name: "Other Supplier" },
      });
      const otherItem = await prisma.item.create({
        data: { tenantId: other.id, code: basic.itemCode, name: "Other Item", stock: 888 },
      });

      const before = {
        stock: (await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).stock,
        otherStock: (await prisma.item.findUniqueOrThrow({ where: { id: otherItem.id } })).stock,
        movements: await prisma.inventoryMovement.count({where:{tenantId:tenant.id}}),
      };
      const rows = exportRows({});
      const first = await restorePurchaseOrdersInDisposableCi({tenantId:tenant.id,rows});
      expect(first).toEqual({
        sourceDocuments:1, sourceLines:1, created:1,
        skippedIdentical:0, stockMovementsCreated:0, itemStockUpdated:0, warnings:1,
      });
      const po = await prisma.purchaseOrder.findUniqueOrThrow({
        where:{tenantId_poNumber:{tenantId:tenant.id,poNumber:basic.poNumber}},
        include:{items:true},
      });
      expect(po).toMatchObject({
        tenantId:tenant.id, supplierId:supplier.id, status:"RECEIVED",
        subtotal:2000,tax:200,total:2200,taxRate:10,
      });
      expect(po.createdAt.toISOString()).toBe(basic.createdAt);
      expect(po.updatedAt.toISOString()).toBe(basic.updatedAt);
      expect(po.items).toHaveLength(1);
      expect(po.items[0]).toMatchObject({
        itemId:item.id, quantity:20,received:21,packSize:10,packCount:2,
        packUnit:"箱",unitPrice:100,amount:2000,
      });
      const second = await restorePurchaseOrdersInDisposableCi({tenantId:tenant.id,rows});
      expect(second).toMatchObject({created:0,skippedIdentical:1});
      expect(await prisma.purchaseOrder.count({where:{tenantId:tenant.id}})).toBe(1);

      // A different snapshot using an existing PO number is a conflict, not a silent overwrite.
      const changed = exportRows({unitPrice:101,amount:2020,subtotal:2020,tax:202,total:2222});
      await expect(restorePurchaseOrdersInDisposableCi({tenantId:tenant.id,rows:changed}))
        .rejects.toThrow("別の内容");
      // A new good PO and a bad reference in the SAME batch must both roll back.
      const invalidBatch = exportRows(
        {poNumber:"PO-NEW-002"},
        {poNumber:"PO-MISSING-003",itemCode:"MISSING-OTHER-TENANT"},
      );
      await expect(restorePurchaseOrdersInDisposableCi({tenantId:tenant.id,rows:invalidBatch}))
        .rejects.toThrow("同じテナントに商品コード");
      expect(await prisma.purchaseOrder.count({where:{tenantId:tenant.id}})).toBe(1);

      // Even identical codes in a second tenant must not resolve its item or supplier.
      expect(await prisma.purchaseOrder.count({where:{tenantId:other.id}})).toBe(0);
      const after = {
        stock: (await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).stock,
        otherStock: (await prisma.item.findUniqueOrThrow({ where: { id: otherItem.id } })).stock,
        movements: await prisma.inventoryMovement.count({where:{tenantId:tenant.id}}),
      };
      expect(after).toEqual(before);
      expect(before).toEqual({stock:45,otherStock:888,movements:0});

      // Guard refuses Staging even when the source CSV is valid; no query should be issued.
      const saved = process.env.APP_ENV;
      process.env.APP_ENV = "staging";
      try {
        await expect(restorePurchaseOrdersInDisposableCi({tenantId:tenant.id,rows}))
          .rejects.toThrow("disabled outside disposable CI");
      } finally {
        process.env.APP_ENV = saved;
      }
    } finally {
      await prisma.purchaseOrderItem.deleteMany({
        where:{purchaseOrder:{tenantId:{in:[tenant.id,other.id]}}},
      });
      await prisma.purchaseOrder.deleteMany({where:{tenantId:{in:[tenant.id,other.id]}}});
      await prisma.inventoryMovement.deleteMany({where:{tenantId:{in:[tenant.id,other.id]}}});
      await prisma.item.deleteMany({where:{tenantId:{in:[tenant.id,other.id]}}});
      await prisma.supplier.deleteMany({where:{tenantId:{in:[tenant.id,other.id]}}});
      await prisma.tenant.deleteMany({where:{id:{in:[tenant.id,other.id]}}});
    }
  });
});
