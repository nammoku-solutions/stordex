import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL ?? "";
const disposable = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?schema=public)?$/.test(url);

describe("safe removal of historical product records on disposable PostgreSQL", () => {
  it.runIf(disposable)("blocks stock/open orders, retires historic linked items, keeps all order and ledger rows", async () => {
    const { prisma } = await import("@/lib/db");
    const { safelyRemoveItem } = await import("./item-removal");
    const tag = randomUUID().slice(0, 10);
    const tenant = await prisma.tenant.create({
      data: { slug: "ci-retire-item-" + tag, name: "CI retirement" },
    });
    const stranger = await prisma.tenant.create({
      data: { slug: "ci-retire-other-" + tag, name: "Other tenant" },
    });
    try {
      const customer = await prisma.customer.create({
        data: { tenantId: tenant.id, code: "C-R", name: "CI customer" },
      });
      const supplier = await prisma.supplier.create({
        data: { tenantId: tenant.id, code: "S-R", name: "CI supplier" },
      });
      const linked = await prisma.item.create({
        data: { tenantId: tenant.id, code: "ITEM-B", name: "商品B", stock: 10 },
      });
      const strangerItem = await prisma.item.create({
        data: { tenantId: stranger.id, code: "ITEM-B", name: "Other Item", stock: 99 },
      });
      const sale = await prisma.order.create({
        data: {
          tenantId: tenant.id, customerId: customer.id,
          orderNumber: "CI-SALE-" + tag, status: "DRAFT",
          items: { create: [{
            itemId: linked.id, itemName: linked.name, unit: "個",
            quantity: 1, unitPrice: 100, amount: 100, costPrice: 60,
          }] },
        },
      });
      const po = await prisma.purchaseOrder.create({
        data: {
          tenantId: tenant.id, supplierId: supplier.id,
          poNumber: "CI-PO-" + tag, status: "RECEIVED",
          items: { create: [{
            itemId: linked.id, itemName: linked.name, unit: "個",
            quantity: 10, received: 10, unitPrice: 50, amount: 500,
          }] },
        },
      });
      await prisma.inventoryMovement.create({
        data: {
          tenantId: tenant.id, itemId: linked.id,
          type: "INBOUND", quantity: 10, balance: 10,
        },
      });

      expect(await safelyRemoveItem(tenant.id, linked.id)).toBe("stock-remains");
      expect((await prisma.item.findUniqueOrThrow({
        where: { id: linked.id },
      })).active).toBe(true);

      // CI-only stock clearance represents an auditable count adjustment.
      await prisma.item.update({ where: { id: linked.id }, data: { stock: 0 } });
      await prisma.inventoryMovement.create({
        data: {
          tenantId: tenant.id, itemId: linked.id,
          type: "ADJUSTMENT", quantity: -10, balance: 0,
          note: "CI stock clearance",
        },
      });
      expect(await safelyRemoveItem(tenant.id, linked.id)).toBe("open-transactions");

      // Closing the outstanding sales order must preserve its historic line.
      await prisma.order.update({
        where: { id: sale.id }, data: { status: "CANCELLED" },
      });
      expect(await safelyRemoveItem(stranger.id, linked.id)).toBe("not-found");
      expect(await safelyRemoveItem(tenant.id, linked.id)).toBe("retired");
      expect(await safelyRemoveItem(tenant.id, linked.id)).toBe("already-retired");

      const retired = await prisma.item.findUniqueOrThrow({ where: { id: linked.id } });
      expect(retired).toMatchObject({ active: false, stock: 0, code: "ITEM-B" });
      expect(await prisma.orderItem.count({
        where: { itemId: linked.id, orderId: sale.id },
      })).toBe(1);
      expect(await prisma.purchaseOrderItem.count({
        where: { itemId: linked.id, purchaseOrderId: po.id },
      })).toBe(1);
      expect(await prisma.inventoryMovement.count({
        where: { tenantId: tenant.id, itemId: linked.id },
      })).toBe(2);
      expect((await prisma.item.findUniqueOrThrow({
        where: { id: strangerItem.id },
      })).stock).toBe(99);

      const empty = await prisma.item.create({
        data: { tenantId: tenant.id, code: "NEW-UNUSED", name: "未使用品", stock: 0 },
      });
      expect(await safelyRemoveItem(tenant.id, empty.id)).toBe("removed");
      expect(await prisma.item.findUnique({ where: { id: empty.id } })).toBeNull();

      const hasStockButNoHistory = await prisma.item.create({
        data: { tenantId: tenant.id, code: "HAS-STOCK", name: "在庫あり", stock: 3 },
      });
      expect(await safelyRemoveItem(tenant.id, hasStockButNoHistory.id)).toBe("stock-remains");
      expect((await prisma.item.findUniqueOrThrow({
        where: { id: hasStockButNoHistory.id },
      })).stock).toBe(3);
    } finally {
      await prisma.orderItem.deleteMany({ where: { order: { tenantId: tenant.id } } });
      await prisma.order.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrder: { tenantId: tenant.id } },
      });
      await prisma.purchaseOrder.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.inventoryMovement.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.item.deleteMany({
        where: { tenantId: { in: [tenant.id, stranger.id] } },
      });
      await prisma.customer.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.supplier.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenant.id, stranger.id] } },
      });
    }
  }, 45000);
});