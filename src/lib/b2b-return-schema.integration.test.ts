import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const disposable = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?schema=public)?$/
    .test(process.env.DATABASE_URL ?? "");

describe("draft B2B return request schema and source provenance", () => {
  it.runIf(disposable)(
    "rejects cross-tenant forgeries, unrelated source lines and mutable requests (local CI DB only)",
    async () => {
      const { prisma } = await import("./db");
      const suffix = randomUUID().slice(0, 10);
      const buyer = await prisma.tenant.create({
        data: { name: "Return buyer", slug: "ci-return-b-" + suffix },
      });
      const seller = await prisma.tenant.create({
        data: { name: "Return seller", slug: "ci-return-s-" + suffix },
      });
      try {
        const [tenantAId, tenantBId] = [buyer.id, seller.id].sort();
        const connection = await prisma.tradingConnection.create({
          data: {
            tenantAId, tenantBId, requestedByTenantId: buyer.id,
            status: "ACTIVE",
          },
        });
        const supplier = await prisma.supplier.create({
          data: { tenantId: buyer.id, code: "SUP", name: "Return seller" },
        });
        const customer = await prisma.customer.create({
          data: { tenantId: seller.id, code: "BUY", name: "Return buyer" },
        });
        const buyerItem = await prisma.item.create({
          data: { tenantId: buyer.id, code: "RET-B", name: "Return buyer item" },
        });
        const sellerItem = await prisma.item.create({
          data: { tenantId: seller.id, code: "RET-S", name: "Return seller item" },
        });
        const sellerOrder = await prisma.order.create({
          data: {
            tenantId: seller.id, customerId: customer.id,
            orderNumber: "SO-RET-" + suffix, status: "SHIPPED",
            items: {
              create: [{
                itemId: sellerItem.id, itemName: "Seller item",
                unit: "個", quantity: 5, unitPrice: 100, amount: 500,
              }],
            },
          },
          include: { items: true },
        });
        const buyerPO = await prisma.purchaseOrder.create({
          data: {
            tenantId: buyer.id, supplierId: supplier.id,
            poNumber: "PO-RET-" + suffix, status: "RECEIVED",
            items: {
              create: [{
                itemId: buyerItem.id, itemName: "Buyer item",
                unit: "個", quantity: 5, received: 4, unitPrice: 100, amount: 500,
              }],
            },
          },
          include: { items: true },
        });
        const companyOrder = await prisma.intercompanyOrder.create({
          data: {
            connectionId: connection.id, buyerTenantId: buyer.id,
            sellerTenantId: seller.id, purchaseOrderId: buyerPO.id,
            sellerOrderId: sellerOrder.id,
            poNumber: buyerPO.poNumber, orderDate: new Date(),
            subtotal: 500, taxRate: 10, tax: 50, total: 550,
            status: "ACCEPTED",
            items: {
              create: [{
                sourcePurchaseOrderItemId: buyerPO.items[0].id,
                sellerOrderItemId: sellerOrder.items[0].id,
                buyerItemCode: buyerItem.code, itemName: "Buyer item",
                unit: "個", quantity: 5, unitPrice: 100, amount: 500,
              }],
            },
          },
          include: { items: true },
        });
        const request = await prisma.b2BReturnRequest.create({
          data: {
            intercompanyOrderId: companyOrder.id,
            buyerTenantId: buyer.id, sellerTenantId: seller.id,
            requestNumber: "RET-" + suffix, requestedByUserId: "buyer-operator",
            status: "SUBMITTED",
          },
        });
        const line = await prisma.b2BReturnItem.create({
          data: {
            returnRequestId: request.id,
            intercompanyOrderId: companyOrder.id,
            sourceLineId: companyOrder.items[0].id,
            requestedQuantity: 3, approvedQuantity: 0,
            reason: "DAMAGED", note: "outer box broken",
          },
        });
        expect(line.requestedQuantity).toBe(3);
        expect(line.approvedQuantity).toBe(0);

        await expect(prisma.b2BReturnRequest.create({
          data: {
            intercompanyOrderId: companyOrder.id,
            buyerTenantId: seller.id, sellerTenantId: buyer.id,
            requestNumber: "FORGED-" + suffix, requestedByUserId: "attacker",
          },
        })).rejects.toThrow();

        await expect(prisma.b2BReturnItem.create({
          data: {
            returnRequestId: request.id, intercompanyOrderId: companyOrder.id,
            sourceLineId: companyOrder.items[0].id,
            requestedQuantity: 1, reason: "OTHER",
          },
        })).rejects.toThrow();

        await expect(prisma.b2BReturnItem.update({
          where: { id: line.id },
          data: { requestedQuantity: 4 },
        })).rejects.toThrow();

        await expect(prisma.b2BReturnRequest.update({
          where: { id: request.id },
          data: { sellerTenantId: buyer.id },
        })).rejects.toThrow();

        const approved = await prisma.b2BReturnItem.update({
          where: { id: line.id },
          data: {
            approvedQuantity: 2, decidedByUserId: "seller-operator",
            decidedAt: new Date(),
          },
        });
        expect(approved.approvedQuantity).toBe(2);
        await expect(prisma.b2BReturnItem.update({
          where: { id: line.id }, data: { approvedQuantity: 4 },
        })).rejects.toThrow();

        const po2 = await prisma.purchaseOrder.create({
          data: {
            tenantId: buyer.id, supplierId: supplier.id,
            poNumber: "PO-OTHER-" + suffix, status: "ORDERED",
            items: {
              create: [{
                itemId: buyerItem.id, itemName: "Unrelated buyer item",
                unit: "個", quantity: 2, unitPrice: 100, amount: 200,
              }],
            },
          },
          include: { items: true },
        });
        const otherCompanyOrder = await prisma.intercompanyOrder.create({
          data: {
            connectionId: connection.id, buyerTenantId: buyer.id,
            sellerTenantId: seller.id, purchaseOrderId: po2.id,
            poNumber: po2.poNumber, orderDate: new Date(),
            subtotal: 200, taxRate: 10, tax: 20, total: 220,
            status: "SENT",
            items: { create: [{
              sourcePurchaseOrderItemId: po2.items[0].id,
              buyerItemCode: buyerItem.code, itemName: "Unrelated",
              unit: "個", quantity: 2, unitPrice: 100, amount: 200,
            }] },
          },
          include: { items: true },
        });
        await expect(prisma.b2BReturnItem.create({
          data: {
            returnRequestId: request.id,
            intercompanyOrderId: companyOrder.id,
            sourceLineId: otherCompanyOrder.items[0].id,
            requestedQuantity: 1, reason: "WRONG_ITEM",
          },
        })).rejects.toThrow();
        expect(await prisma.b2BReturnItem.count({
          where: { returnRequestId: request.id },
        })).toBe(1);
      } finally {
        await prisma.b2BReturnItem.deleteMany({
          where: { returnRequest: { buyerTenantId: buyer.id } },
        });
        await prisma.b2BReturnRequest.deleteMany({ where: { buyerTenantId: buyer.id } });
        await prisma.intercompanyOrder.deleteMany({ where: { buyerTenantId: buyer.id } });
        await prisma.purchaseOrder.deleteMany({ where: { tenantId: buyer.id } });
        await prisma.order.deleteMany({ where: { tenantId: seller.id } });
        await prisma.inventoryMovement.deleteMany({
          where: { tenantId: { in: [buyer.id, seller.id] } },
        });
        await prisma.item.deleteMany({ where: { tenantId: { in: [buyer.id, seller.id] } } });
        await prisma.supplier.deleteMany({ where: { tenantId: buyer.id } });
        await prisma.customer.deleteMany({ where: { tenantId: seller.id } });
        await prisma.tradingConnection.deleteMany({
          where: { OR: [{ tenantAId: buyer.id }, { tenantBId: buyer.id }] },
        });
        await prisma.tenant.deleteMany({
          where: { id: { in: [buyer.id, seller.id] } },
        });
      }
    }, 60000,
  );
});
