import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL ?? "";
const disposable = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?|$)/.test(url);

describe("monthly invoice concurrency and unbilled-order integrity", () => {
  it.runIf(disposable)(
    "only bills an order once and keeps monthly numbers unique under concurrent POSTs",
    async () => {
      const { prisma } = await import("./db");
      const { createMonthlyInvoiceDraft } = await import("./invoice-creation");
      const suffix = randomUUID().slice(0, 12);
      const tenant = await prisma.tenant.create({
        data: { slug: "ci-invoice-" + suffix, name: "CI Invoice Tenant" },
      });
      try {
        const firstCustomer = await prisma.customer.create({
          data: { tenantId: tenant.id, code: "INV-A", name: "Customer A" },
        });
        const secondCustomer = await prisma.customer.create({
          data: { tenantId: tenant.id, code: "INV-B", name: "Customer B" },
        });
        const orderDate = new Date("2026-11-25T00:00:00.000Z");
        const orderA = await prisma.order.create({
          data: {
            tenantId: tenant.id, customerId: firstCustomer.id,
            orderNumber: "CI-INV-A-" + suffix, orderDate,
            status: "SHIPPED", subtotal: 180, tax: 18, total: 198,
          },
        });
        const orderB = await prisma.order.create({
          data: {
            tenantId: tenant.id, customerId: secondCustomer.id,
            orderNumber: "CI-INV-B-" + suffix, orderDate,
            status: "SHIPPED", subtotal: 500, tax: 50, total: 550,
          },
        });
        const make = (customerId: string) => createMonthlyInvoiceDraft({
          tenantId: tenant.id, customerId, businessUnitId: null,
          periodYear: 2026, periodMonth: 11, dueDate: null,
          taxRate: 10, taxPerOrder: false, note: "CI-only",
        });
        const results = await Promise.allSettled([
          make(firstCustomer.id), make(firstCustomer.id), make(secondCustomer.id),
        ]);
        expect(results.filter(result => result.status === "fulfilled")).toHaveLength(2);
        expect(results.filter(result => result.status === "rejected")).toHaveLength(1);

        const invoices = await prisma.invoice.findMany({
          where: { tenantId: tenant.id },
          include: { orders: true },
          orderBy: { invoiceNumber: "asc" },
        });
        expect(invoices).toHaveLength(2);
        expect(invoices.map(i => i.invoiceNumber)).toEqual([
          "I-202611-0001", "I-202611-0002",
        ]);
        expect(invoices.every(i => i.status === "DRAFT" && i.orders.length === 1)).toBe(true);
        expect(invoices.map(i => i.total).sort((a, b) => a - b)).toEqual([198, 550]);
        expect(invoices.flatMap(i => i.orders.map(link => link.orderId)).sort())
          .toEqual([orderA.id, orderB.id].sort());

        // Retrying either completed invoice cannot duplicate a billed order.
        await expect(make(firstCustomer.id)).rejects.toThrow(/対象月に集計可能な受注がありません/);
        expect(await prisma.invoiceOrder.count({
          where: { orderId: orderA.id },
        })).toBe(1);
        expect(await prisma.invoiceOrder.count({
          where: { orderId: orderB.id },
        })).toBe(1);
      } finally {
        await prisma.invoice.deleteMany({ where: { tenantId: tenant.id } });
        await prisma.order.deleteMany({ where: { tenantId: tenant.id } });
        await prisma.customer.deleteMany({ where: { tenantId: tenant.id } });
        await prisma.tenant.delete({ where: { id: tenant.id } });
      }
    }, 45000,
  );
});
