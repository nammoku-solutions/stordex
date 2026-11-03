import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { toCsv, exportDate, exportTimestamp } from "@/lib/csv-export";
import { decodeCsvBuffer, parseCsv } from "@/lib/csv/parse";
import {
  PURCHASE_ORDER_EXPORT_HEADERS,
  preflightPurchaseOrderExport,
} from "./purchase-order-preflight";

// A real-database test, restricted to the disposable local PostgreSQL service.
// Never import real Prisma or open a connection on Staging / Production.
const conn = process.env.DATABASE_URL ?? "";
const disposableCi =
  process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?|$)/.test(conn);

describe("purchase-order export preflight with disposable PostgreSQL", () => {
  it.runIf(disposableCi)("audits a counted overreceipt without mutating stock, documents or movements", async () => {
    const { prisma } = await import("@/lib/db");
    const suffix = randomUUID().slice(0, 10);
    const tenant = await prisma.tenant.create({
      data: { slug: "ci-po-preflight-" + suffix, name: "CI PO PREFLIGHT" },
    });
    try {
      const supplier = await prisma.supplier.create({
        data: { tenantId: tenant.id, code: "SUP-01", name: "仕入先,株式会社" },
      });
      const item = await prisma.item.create({
        data: {
          tenantId: tenant.id, code: "BOX-ITEM", name: "箱入商品",
          unit: "個", purchaseMode: "PACK", caseQty: 10, orderUnit: "箱",
          stock: 21,
        },
      });
      const po = await prisma.purchaseOrder.create({
        data: {
          tenantId: tenant.id,
          poNumber: "CI-PO-001",
          supplierId: supplier.id,
          orderDate: new Date("2026-11-03T00:00:00.000Z"),
          status: "RECEIVED",
          subtotal: 2000, taxRate: 10, tax: 200, total: 2200,
          items: { create: [{
            itemId: item.id, itemName: item.name, unit: item.unit,
            quantity: 20, unitPrice: 100, amount: 2000,
            received: 21, packSize: 10, packCount: 2, packUnit: "箱",
          }] },
        },
        include: { supplier: true, items: { include: { item: true } } },
      });
      await prisma.inventoryMovement.create({
        data: {
          tenantId: tenant.id, itemId: item.id,
          type: "INBOUND", quantity: 21, balance: 21,
          reference: po.poNumber,
        },
      });

      const before = {
        orders: await prisma.purchaseOrder.count({ where: { tenantId: tenant.id } }),
        lines: await prisma.purchaseOrderItem.count({ where: { purchaseOrderId: po.id } }),
        movements: await prisma.inventoryMovement.count({ where: { tenantId: tenant.id } }),
        stock: (await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).stock,
      };

      // Match the actual 23-column public export route's output order.
      const rows = po.items.map(line => [
        po.poNumber, po.supplier.code, po.supplier.name,
        exportDate(po.orderDate), exportDate(po.pickupDate), po.status,
        po.note, po.taxRate, po.subtotal, po.tax, po.total,
        line.item.code, line.itemName, line.unit, line.quantity,
        line.unitPrice, line.amount, line.received, line.packSize,
        line.packCount, line.packUnit, exportTimestamp(po.createdAt),
        exportTimestamp(po.updatedAt),
      ]);
      const csv = toCsv([...PURCHASE_ORDER_EXPORT_HEADERS], rows);
      const parsed = parseCsv(decodeCsvBuffer(new TextEncoder().encode(csv)).text);
      const report = preflightPurchaseOrderExport(parsed);

      expect(report).toMatchObject({
        ok: true, documentCount: 1, lineCount: 1,
        sourceTotals: { subtotal: 2000, tax: 200, total: 2200, received: 21 },
      });
      expect(report.warnings.map(w => w.field)).toEqual(["received"]);
      expect(report.documents[0].lines[0]).toMatchObject({
        itemCode: "BOX-ITEM", packSize: 10, packCount: 2, received: 21,
      });

      const after = {
        orders: await prisma.purchaseOrder.count({ where: { tenantId: tenant.id } }),
        lines: await prisma.purchaseOrderItem.count({ where: { purchaseOrderId: po.id } }),
        movements: await prisma.inventoryMovement.count({ where: { tenantId: tenant.id } }),
        stock: (await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).stock,
      };
      expect(after).toEqual(before);
      expect(before).toEqual({ orders: 1, lines: 1, movements: 1, stock: 21 });
    } finally {
      await prisma.tenant.delete({ where: { id: tenant.id } });
    }
  });
});
