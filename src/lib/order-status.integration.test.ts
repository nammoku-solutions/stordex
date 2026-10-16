import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const connection = process.env.DATABASE_URL ?? "";
const localDisposable =
  process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?|$)/.test(connection);

// Intentionally blocked outside the disposable GitHub Actions PostgreSQL DB.
describe("order status transaction and inventory ledger", () => {
  it.runIf(localDisposable)(
    "prevents double-confirmation, restores cancelled stock, rolls back shortage and denies cross-tenant updates",
    async () => {
      const { prisma } = await import("@/lib/db");
      const { applyOrderStatus } = await import("./order-status");
      const uid = randomUUID().slice(0, 12);
      const tenant = await prisma.tenant.create({
        data: { slug: "ci-ledger-" + uid, name: "Order ledger CI" },
      });
      const outsider = await prisma.tenant.create({
        data: { slug: "ci-ledger-other-" + uid, name: "Other tenant CI" },
      });
      try {
        const customer = await prisma.customer.create({
          data: { tenantId: tenant.id, name: "テスト得意先", code: "C001" },
        });
        const item = await prisma.item.create({
          data: { tenantId: tenant.id, name: "A4コピー用紙", code: "PAPER", unit: "箱", stock: 10 },
        });
        const createOrder = (n: string, quantity: number) => prisma.order.create({
          data: {
            tenantId: tenant.id,
            customerId: customer.id,
            orderNumber: `CI-${uid}-${n}`,
            status: "DRAFT",
            items: { create: [{
              itemId: item.id,
              itemName: item.name,
              unit: item.unit,
              quantity, unitPrice: 100, costPrice: 40, amount: quantity * 100,
            }] },
          },
        });
        const order = await createOrder("parallel", 3);
        const claim = () => applyOrderStatus({
          tenantId: tenant.id, userId: "ci-operator",
          orderId: order.id, status: "CONFIRMED",
        });
        const parallel = await Promise.allSettled([claim(), claim()]);
        expect(parallel.some(x => x.status === "fulfilled")).toBe(true);
        expect((await prisma.order.findUniqueOrThrow({ where: {id: order.id} })).status)
          .toBe("CONFIRMED");
        expect((await prisma.item.findUniqueOrThrow({where: {id:item.id}})).stock).toBe(7);
        let movements = await prisma.inventoryMovement.findMany({
          where: {tenantId:tenant.id,reference:order.orderNumber},
        });
        expect(movements).toHaveLength(1);
        expect(movements[0]).toMatchObject({type:"OUTBOUND",quantity:3,balance:7});

        await claim(); // confirmed retry must remain a no-op
        expect(await prisma.inventoryMovement.count({
          where: {tenantId:tenant.id,reference:order.orderNumber},
        })).toBe(1);

        // Confirmed -> Cancelled returns stock exactly once.
        const cancellation = {tenantId:tenant.id,userId:"ci-operator",
          orderId:order.id,status:"CANCELLED" as const};
        await applyOrderStatus(cancellation);
        await applyOrderStatus(cancellation);
        expect((await prisma.item.findUniqueOrThrow({where:{id:item.id}})).stock).toBe(10);
        movements = await prisma.inventoryMovement.findMany({where:{tenantId:tenant.id}});
        expect(movements).toHaveLength(2);
        expect(movements.find(m=>m.type==="INBOUND")).toMatchObject({
          quantity:3,balance:10,
        });
        await expect(applyOrderStatus({
          tenantId:tenant.id,userId:"ci-operator",orderId:order.id,status:"SHIPPED",
        })).rejects.toThrow();

        // Shortage failure must rollback order status and ledger together.
        const impossible = await createOrder("shortage", 100);
        await expect(applyOrderStatus({
          tenantId:tenant.id,userId:"ci-operator",
          orderId:impossible.id,status:"CONFIRMED",
        })).rejects.toThrow(/在庫.*不足/);
        expect((await prisma.order.findUniqueOrThrow({where:{id:impossible.id}})).status)
          .toBe("DRAFT");
        expect((await prisma.item.findUniqueOrThrow({where:{id:item.id}})).stock).toBe(10);
        expect(await prisma.inventoryMovement.count({where:{tenantId:tenant.id}})).toBe(2);

        // The same ID from another tenant must never change any state.
        await expect(applyOrderStatus({
          tenantId:outsider.id,userId:"ci-other",
          orderId:impossible.id,status:"CONFIRMED",
        })).rejects.toThrow(/見つかりません/);
        expect(await prisma.inventoryMovement.count({where:{tenantId:outsider.id}})).toBe(0);

        // Shipping/completing a legitimate confirmed order should not deduct twice.
        const deliverable = await createOrder("ship", 2);
        for (const status of ["CONFIRMED","SHIPPED","COMPLETED"] as const) {
          await applyOrderStatus({
            tenantId:tenant.id,userId:"ci-operator",orderId:deliverable.id,status,
          });
        }
        expect((await prisma.item.findUniqueOrThrow({where:{id:item.id}})).stock).toBe(8);
        const shippedMovements = await prisma.inventoryMovement.findMany({
          where:{tenantId:tenant.id,reference:deliverable.orderNumber},
        });
        expect(shippedMovements).toHaveLength(1);
        expect(shippedMovements[0]).toMatchObject({
          type:"OUTBOUND",quantity:2,balance:8,
        });
      } finally {
        await prisma.inventoryMovement.deleteMany({where:{tenantId:tenant.id}});
        await prisma.order.deleteMany({where:{tenantId:tenant.id}});
        await prisma.item.deleteMany({where:{tenantId:tenant.id}});
        await prisma.customer.deleteMany({where:{tenantId:tenant.id}});
        await prisma.tenant.deleteMany({where:{id:{in:[tenant.id,outsider.id]}}});
      }
    }, 45000,
  );
});
