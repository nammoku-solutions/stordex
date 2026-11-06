import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const disposable = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?schema=public)?$/
    .test(process.env.DATABASE_URL ?? "");

describe("draft B2B return submit/review services on disposable PostgreSQL", () => {
  it.runIf(disposable)("scopes buyer request, idempotency, partial approval and seller review", async () => {
    const { prisma } = await import("@/lib/db");
    const { submitB2BReturnRequest, reviewB2BReturnRequest } =
      await import("./b2b-return-service");
    const tag = randomUUID().slice(0, 9);
    const buyer = await prisma.tenant.create({
      data: { slug: "ci-return-buyer-" + tag, name: "Return buyer" },
    });
    const seller = await prisma.tenant.create({
      data: { slug: "ci-return-seller-" + tag, name: "Return seller" },
    });
    try {
      const [buyerAdmin, sellerAdmin, sellerStaff] = await Promise.all([
        prisma.user.create({ data: {
          tenantId: buyer.id, email: "b-" + tag + "@example.test",
          name: "Buyer Admin", passwordHash: "ci-only", role: "OWNER",
        } }),
        prisma.user.create({ data: {
          tenantId: seller.id, email: "s-" + tag + "@example.test",
          name: "Seller Admin", passwordHash: "ci-only", role: "ADMIN",
        } }),
        prisma.user.create({ data: {
          tenantId: seller.id, email: "staff-" + tag + "@example.test",
          name: "Seller Staff", passwordHash: "ci-only", role: "STAFF",
        } }),
      ]);
      const [tenantAId, tenantBId] = [buyer.id, seller.id].sort();
      const connection = await prisma.tradingConnection.create({
        data: {
          tenantAId, tenantBId, requestedByTenantId: buyer.id, status: "ACTIVE",
        },
      });
      const supplier = await prisma.supplier.create({ data: {
        tenantId: buyer.id, code: "B2B-SUP", name: "Partner",
      } });
      const customer = await prisma.customer.create({ data: {
        tenantId: seller.id, code: "B2B-BUY", name: "Buyer",
      } });
      const buyerItem = await prisma.item.create({ data: {
        tenantId: buyer.id, code: "CI-RETURN", name: "Buyer item", stock: 4,
      } });
      const sellerItem = await prisma.item.create({ data: {
        tenantId: seller.id, code: "CI-RETURN", name: "Seller item", stock: 5,
      } });
      const po = await prisma.purchaseOrder.create({
        data: {
          tenantId: buyer.id, supplierId: supplier.id,
          poNumber: "CI-RPO-" + tag, status: "RECEIVED",
          items: { create: [{
            itemId: buyerItem.id, itemName: buyerItem.name,
            quantity: 5, received: 4, unit: "個", unitPrice: 100, amount: 500,
          }] },
        },
        include: { items: true },
      });
      const so = await prisma.order.create({
        data: {
          tenantId: seller.id, customerId: customer.id,
          orderNumber: "CI-RSO-" + tag, status: "SHIPPED",
          items: { create: [{
            itemId: sellerItem.id, itemName: sellerItem.name,
            quantity: 5, unit: "個", unitPrice: 100, amount: 500,
          }] },
        },
        include: { items: true },
      });
      const company = await prisma.intercompanyOrder.create({
        data: {
          connectionId: connection.id, buyerTenantId: buyer.id,
          sellerTenantId: seller.id, purchaseOrderId: po.id,
          sellerOrderId: so.id, poNumber: po.poNumber,
          orderDate: new Date(), status: "ACCEPTED",
          subtotal: 500, taxRate: 10, tax: 50, total: 550,
          items: { create: [{
            sourcePurchaseOrderItemId: po.items[0].id,
            sellerOrderItemId: so.items[0].id,
            buyerItemCode: buyerItem.code, itemName: buyerItem.name,
            quantity: 5, unit: "個", unitPrice: 100, amount: 500,
          }] },
        },
        include: { items: true },
      });
      const lineId = company.items[0].id;
      const key = randomUUID();
      const submitted = {
        buyerTenantId: buyer.id, userId: buyerAdmin.id,
        intercompanyOrderId: company.id, idempotencyKey: key,
        lines: [{
          sourceLineId: lineId, requestedQuantity: 3,
          reason: "DAMAGED" as const, note: "broken packaging",
        }],
      };
      const first = await submitB2BReturnRequest(submitted);
      expect(first.created).toBe(true);
      expect((await submitB2BReturnRequest(submitted))).toEqual({
        requestId: first.requestId, created: false,
      });
      expect(await prisma.b2BReturnRequest.count({
        where: { buyerTenantId: buyer.id },
      })).toBe(1);

      await expect(submitB2BReturnRequest({
        ...submitted, lines: [{ ...submitted.lines[0], requestedQuantity: 2 }],
      })).rejects.toThrow("異なる返品申請");

      await expect(submitB2BReturnRequest({
        ...submitted, idempotencyKey: randomUUID(),
        lines: [{ ...submitted.lines[0], requestedQuantity: 2 }],
      })).rejects.toThrow("残数量");

      await expect(submitB2BReturnRequest({
        ...submitted, buyerTenantId: seller.id,
        idempotencyKey: randomUUID(),
      })).rejects.toThrow();

      await expect(reviewB2BReturnRequest({
        sellerTenantId: seller.id, userId: sellerStaff.id,
        requestId: first.requestId,
        decisions: [{ sourceLineId: lineId, approvedQuantity: 2 }],
        reviewNote: "one item not eligible",
      })).rejects.toThrow("管理者権限");

      await expect(reviewB2BReturnRequest({
        sellerTenantId: buyer.id, userId: buyerAdmin.id,
        requestId: first.requestId,
        decisions: [{ sourceLineId: lineId, approvedQuantity: 2 }],
        reviewNote: "cannot approve as buyer",
      })).rejects.toThrow("見つかりません");

      const reviewed = await reviewB2BReturnRequest({
        sellerTenantId: seller.id, userId: sellerAdmin.id,
        requestId: first.requestId,
        decisions: [{ sourceLineId: lineId, approvedQuantity: 2 }],
        reviewNote: "  damaged only two confirmed  ",
      });
      expect(reviewed.status).toBe("PARTIALLY_APPROVED");
      const stored = await prisma.b2BReturnRequest.findUniqueOrThrow({
        where: { id: first.requestId }, include: { items: true },
      });
      expect(stored).toMatchObject({
        status: "PARTIALLY_APPROVED", reviewedByUserId: sellerAdmin.id,
        reviewNote: "damaged only two confirmed",
      });
      expect(stored.items).toHaveLength(1);
      expect(stored.items[0]).toMatchObject({
        requestedQuantity: 3, approvedQuantity: 2,
        decidedByUserId: sellerAdmin.id,
      });

      await expect(reviewB2BReturnRequest({
        sellerTenantId: seller.id, userId: sellerAdmin.id,
        requestId: first.requestId,
        decisions: [{ sourceLineId: lineId, approvedQuantity: 2 }],
        reviewNote: "double click",
      })).rejects.toThrow("処理済み");

      // Two approved units remain committed; two receipt units are free.
      const second = await submitB2BReturnRequest({
        ...submitted, idempotencyKey: randomUUID(),
        lines: [{ ...submitted.lines[0], requestedQuantity: 2 }],
      });
      expect(second.created).toBe(true);
      await expect(submitB2BReturnRequest({
        ...submitted, idempotencyKey: randomUUID(),
        lines: [{ ...submitted.lines[0], requestedQuantity: 1 }],
      })).rejects.toThrow("残数量");
      expect(await prisma.b2BReturnRequest.count({
        where: { buyerTenantId: buyer.id },
      })).toBe(2);

      const stocks = await prisma.item.findMany({
        where: { id: { in: [buyerItem.id, sellerItem.id] } },
      });
      expect(stocks.find(item => item.id === buyerItem.id)?.stock).toBe(4);
      expect(stocks.find(item => item.id === sellerItem.id)?.stock).toBe(5);
      expect(await prisma.inventoryMovement.count({
        where: { tenantId: { in: [buyer.id, seller.id] } },
      })).toBe(0);
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
      await prisma.item.deleteMany({
        where: { tenantId: { in: [buyer.id, seller.id] } },
      });
      await prisma.supplier.deleteMany({ where: { tenantId: buyer.id } });
      await prisma.customer.deleteMany({ where: { tenantId: seller.id } });
      await prisma.tradingConnection.deleteMany({
        where: { OR: [{ tenantAId: buyer.id }, { tenantBId: buyer.id }] },
      });
      await prisma.user.deleteMany({
        where: { tenantId: { in: [buyer.id, seller.id] } },
      });
      await prisma.tenant.deleteMany({
        where: { id: { in: [buyer.id, seller.id] } },
      });
    }
  }, 60000);
});
