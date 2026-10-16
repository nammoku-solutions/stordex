import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const connection = process.env.DATABASE_URL ?? "";
const disposable =
  process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?|$)/.test(connection);

describe("agreed pre-shipment B2B cancellation and inventory reconciliation", () => {
  it.runIf(disposable)(
    "seller first, buyer second; handles draft/confirmed/shipped, retries, and races",
    async () => {
      const { prisma } = await import("./db");
      const { sendOrderToCompany } = await import("./b2b-send");
      const { acceptCompanyPurchaseOrder } = await import("./b2b-accept");
      const { applyOrderStatus } = await import("./order-status");
      const { applyPurchaseOrderStatus } = await import("./purchase-order-status");
      const { orderedTenantPair } = await import("./trading-connections");
      const suffix = randomUUID().slice(0, 10);
      const buyer = await prisma.tenant.create({
        data: { name: "Coordinated Cancel Buyer", slug: "ci-cancel-buyer-" + suffix },
      });
      const seller = await prisma.tenant.create({
        data: { name: "Coordinated Cancel Seller", slug: "ci-cancel-seller-" + suffix },
      });
      try {
        const [tenantAId, tenantBId] = orderedTenantPair(buyer.id, seller.id);
        await prisma.tradingConnection.create({
          data: { tenantAId, tenantBId, requestedByTenantId: buyer.id, status: "ACTIVE" },
        });
        const [supplier, customer, buyerItem, sellerItem] = await Promise.all([
          prisma.supplier.create({
            data: { tenantId: buyer.id, code: "PARTNER", name: "Seller" },
          }),
          prisma.customer.create({
            data: { tenantId: seller.id, code: "PARTNER", name: "Buyer" },
          }),
          prisma.item.create({
            data: { tenantId: buyer.id, code: "B-PAPER", name: "A4 paper", unit: "箱", stock: 10 },
          }),
          prisma.item.create({
            data: { tenantId: seller.id, code: "S-PAPER", name: "A4 paper", unit: "箱", stock: 20 },
          }),
        ]);
        const sales = (orderId: string, status: "CONFIRMED" | "SHIPPED" | "CANCELLED") =>
          applyOrderStatus({ tenantId: seller.id, userId: "ci-seller", orderId, status });
        const purchasing = (poId: string, status: "CANCELLED" | "RECEIVED") =>
          applyPurchaseOrderStatus({ tenantId: buyer.id, userId: "ci-buyer", id: poId, status });
        let seq = 0;
        async function linkedPO() {
          seq++;
          const po = await prisma.purchaseOrder.create({
            data: {
              tenantId: buyer.id, supplierId: supplier.id,
              poNumber: `CI-CANCEL-${suffix}-${seq}`, status: "ORDERED",
              subtotal: 400, tax: 40, total: 440,
              items: { create: [{
                itemId: buyerItem.id, itemName: buyerItem.name, unit: "箱",
                quantity: 2, unitPrice: 200, amount: 400,
              }] },
            },
          });
          await sendOrderToCompany({
            tenantId: buyer.id, partnerId: seller.id, purchaseOrderId: po.id,
          });
          const company = await prisma.intercompanyOrder.findUniqueOrThrow({
            where: { purchaseOrderId: po.id }, include: { items: true },
          });
          const fd = new FormData();
          fd.set("inboundId", company.id);
          fd.set("customerId", customer.id);
          fd.set("item_" + company.items[0].id, sellerItem.id);
          const sellerOrderId = await acceptCompanyPurchaseOrder({
            tenantId: seller.id, formData: fd,
          });
          return { po, company, sellerOrderId };
        }
        const statusOf = (id: string) => prisma.intercompanyOrder.findUniqueOrThrow({
          where: { id }, select: { status: true },
        });
        const stockOf = (id: string) => prisma.item.findUniqueOrThrow({
          where: { id }, select: { stock: true },
        });

        // DRAFT seller cancel cannot mutate stock. Buyer cancel is blocked first.
        const draft = await linkedPO();
        await expect(purchasing(draft.po.id, "CANCELLED")).rejects.toThrow(/先方/);
        await sales(draft.sellerOrderId, "CANCELLED");
        expect((await stockOf(sellerItem.id)).stock).toBe(20);
        expect((await statusOf(draft.company.id)).status).toBe("ACCEPTED");
        expect((await prisma.purchaseOrder.findUniqueOrThrow({
          where: { id: draft.po.id },
        })).status).toBe("ORDERED");
        await purchasing(draft.po.id, "CANCELLED");
        await sales(draft.sellerOrderId, "CANCELLED");
        await purchasing(draft.po.id, "CANCELLED");
        expect((await statusOf(draft.company.id)).status).toBe("CANCELLED");
        expect(await prisma.inventoryMovement.count({
          where: { tenantId: { in: [buyer.id, seller.id] } },
        })).toBe(0);

        // CONFIRMED seller has stock deducted; cancellation adds exactly one
        // compensating INBOUND movement, even when invoked repeatedly.
        const confirmed = await linkedPO();
        await sales(confirmed.sellerOrderId, "CONFIRMED");
        expect((await stockOf(sellerItem.id)).stock).toBe(18);
        await expect(purchasing(confirmed.po.id, "CANCELLED")).rejects.toThrow();
        const repeated = await Promise.allSettled([
          sales(confirmed.sellerOrderId, "CANCELLED"),
          sales(confirmed.sellerOrderId, "CANCELLED"),
        ]);
        expect(repeated.some(x => x.status === "fulfilled")).toBe(true);
        expect((await stockOf(sellerItem.id)).stock).toBe(20);
        const order = await prisma.order.findUniqueOrThrow({
          where: { id: confirmed.sellerOrderId },
        });
        expect(order.status).toBe("CANCELLED");
        expect((await prisma.inventoryMovement.findMany({
          where: { tenantId: seller.id, itemId: sellerItem.id },
          orderBy: { createdAt: "asc" },
        })).map(m => m.type).sort()).toEqual(["INBOUND", "OUTBOUND"]);
        expect(await prisma.inventoryMovement.count({
          where: { tenantId: seller.id },
        })).toBe(2);
        await purchasing(confirmed.po.id, "CANCELLED");
        expect((await statusOf(confirmed.company.id)).status).toBe("CANCELLED");
        expect((await stockOf(buyerItem.id)).stock).toBe(10);

        // No cancellation once the seller has shipped; normal receipt is possible.
        const shipped = await linkedPO();
        await sales(shipped.sellerOrderId, "CONFIRMED");
        await sales(shipped.sellerOrderId, "SHIPPED");
        expect((await stockOf(sellerItem.id)).stock).toBe(18);
        await expect(sales(shipped.sellerOrderId, "CANCELLED")).rejects.toThrow();
        await expect(purchasing(shipped.po.id, "CANCELLED")).rejects.toThrow();
        await purchasing(shipped.po.id, "RECEIVED");
        expect((await stockOf(buyerItem.id)).stock).toBe(12);
        expect((await stockOf(sellerItem.id)).stock).toBe(18);
        await expect(purchasing(shipped.po.id, "CANCELLED")).rejects.toThrow();

        // An invoiced seller order needs credit-note reconciliation;
        // do not allow a simple cancellation (or buyer-side unilateral cancel).
        const billed = await linkedPO();
        await prisma.invoice.create({
          data: {
            tenantId: seller.id, customerId: customer.id,
            invoiceNumber: "CI-INVOICE-" + suffix,
            periodYear: 2026, periodMonth: 10,
            orders: { create: [{ orderId: billed.sellerOrderId }] },
          },
        });
        await expect(sales(billed.sellerOrderId, "CANCELLED")).rejects.toThrow(/請求書/);
        await expect(purchasing(billed.po.id, "CANCELLED")).rejects.toThrow();

        // Partial receipt is never undone using simple document cancellation.
        const partiallyReceived = await linkedPO();
        await sales(partiallyReceived.sellerOrderId, "CANCELLED");
        await prisma.purchaseOrderItem.updateMany({
          where: { purchaseOrderId: partiallyReceived.po.id },
          data: { received: 1 },
        });
        await expect(purchasing(partiallyReceived.po.id, "CANCELLED"))
          .rejects.toThrow(/入荷済み/);

        // Shipment competing with agreed cancellation: one winner only.
        const race = await linkedPO();
        await sales(race.sellerOrderId, "CONFIRMED");
        expect((await stockOf(sellerItem.id)).stock).toBe(16);
        const competing = await Promise.allSettled([
          sales(race.sellerOrderId, "SHIPPED"),
          sales(race.sellerOrderId, "CANCELLED"),
        ]);
        expect(competing.filter(x => x.status === "fulfilled")).toHaveLength(1);
        const finalSeller = await prisma.order.findUniqueOrThrow({
          where: { id: race.sellerOrderId },
        });
        expect(["SHIPPED", "CANCELLED"]).toContain(finalSeller.status);
        if (finalSeller.status === "SHIPPED") {
          expect((await stockOf(sellerItem.id)).stock).toBe(16);
          await expect(purchasing(race.po.id, "CANCELLED")).rejects.toThrow();
        } else {
          expect((await stockOf(sellerItem.id)).stock).toBe(18);
          await purchasing(race.po.id, "CANCELLED");
          expect((await statusOf(race.company.id)).status).toBe("CANCELLED");
        }
        await expect(applyOrderStatus({
          tenantId: buyer.id, userId: "ci-cross", orderId: race.sellerOrderId,
          status: "CANCELLED",
        })).rejects.toThrow(/見つかりません/);
      } finally {
        await prisma.inventoryMovement.deleteMany({
          where: { tenantId: { in: [buyer.id, seller.id] } },
        });
        await prisma.intercompanyOrder.deleteMany({
          where: { buyerTenantId: buyer.id },
        });
        await prisma.invoice.deleteMany({ where: { tenantId: seller.id } });
        await prisma.order.deleteMany({ where: { tenantId: seller.id } });
        await prisma.purchaseOrder.deleteMany({ where: { tenantId: buyer.id } });
        await prisma.item.deleteMany({
          where: { tenantId: { in: [buyer.id, seller.id] } },
        });
        await prisma.customer.deleteMany({ where: { tenantId: seller.id } });
        await prisma.supplier.deleteMany({ where: { tenantId: buyer.id } });
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
