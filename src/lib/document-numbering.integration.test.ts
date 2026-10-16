import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { tokyoDocumentDate } from "./document-numbering";

// Never execute integration writes outside disposable GitHub Actions Postgres.
// This is purposely stricter than general NODE_ENV=test.
const connection = process.env.DATABASE_URL ?? "";
const localDisposable =
  process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?|$)/.test(connection);

describe("PostgreSQL tenant-scoped document numbering", () => {
  it("uses Tokyo business date independent of the function host time zone", () => {
    expect(tokyoDocumentDate(new Date("2026-10-16T16:30:00.000Z"))).toBe("20261017");
    expect(tokyoDocumentDate(new Date("2026-10-16T14:30:00.000Z"))).toBe("20261016");
  });

  it.runIf(localDisposable)(
    "creates unique sequential SO/P document numbers under concurrent requests",
    async () => {
      const { prisma } = await import("@/lib/db");
      const { nextDocumentNumber } = await import("./document-numbering");
      const suffix = randomUUID().slice(0, 12);
      const tenant = await prisma.tenant.create({
        data: { name: "CI document counter", slug: "ci-doc-numbers-" + suffix },
      });
      try {
        const customer = await prisma.customer.create({
          data: { tenantId: tenant.id, name: "CI buyer", code: "CI-C" },
        });
        const supplier = await prisma.supplier.create({
          data: { tenantId: tenant.id, name: "CI seller", code: "CI-S" },
        });
        const now = new Date();
        const ymd = tokyoDocumentDate(now);
        const insertSO = () => prisma.$transaction(async tx => {
          const orderNumber = await nextDocumentNumber(tx, tenant.id, "SO", now);
          return tx.order.create({
            data: { tenantId: tenant.id, orderNumber, customerId: customer.id, status: "DRAFT" },
            select: { orderNumber: true },
          });
        }, { maxWait: 15000, timeout: 15000 });
        const insertPO = () => prisma.$transaction(async tx => {
          const poNumber = await nextDocumentNumber(tx, tenant.id, "P", now);
          return tx.purchaseOrder.create({
            data: { tenantId: tenant.id, poNumber, supplierId: supplier.id, status: "DRAFT" },
            select: { poNumber: true },
          });
        }, { maxWait: 15000, timeout: 15000 });

        // Runs in parallel on multiple DB sessions; advisory transaction locks
        // must serialize readers without leaking into subsequent transactions.
        const sales = await Promise.all([insertSO(), insertSO(), insertSO()]);
        expect(sales.map(x => x.orderNumber).sort()).toEqual([
          `SO-${ymd}-0001`, `SO-${ymd}-0002`, `SO-${ymd}-0003`,
        ]);
        const purchases = await Promise.all([insertPO(), insertPO(), insertPO()]);
        expect(purchases.map(x => x.poNumber).sort()).toEqual([
          `P-${ymd}-0001`, `P-${ymd}-0002`, `P-${ymd}-0003`,
        ]);
        expect(await prisma.order.count({ where: { tenantId: tenant.id } })).toBe(3);
        expect(await prisma.purchaseOrder.count({ where: { tenantId: tenant.id } })).toBe(3);
      } finally {
        await prisma.order.deleteMany({ where: { tenantId: tenant.id } });
        await prisma.purchaseOrder.deleteMany({ where: { tenantId: tenant.id } });
        await prisma.customer.deleteMany({ where: { tenantId: tenant.id } });
        await prisma.supplier.deleteMany({ where: { tenantId: tenant.id } });
        await prisma.tenant.delete({ where: { id: tenant.id } });
      }
    },
    45000,
  );
});
