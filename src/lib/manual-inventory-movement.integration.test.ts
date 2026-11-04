import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseManualInventoryInput } from "./manual-inventory-input";

const disposable = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?schema=public)?$/
    .test(process.env.DATABASE_URL ?? "");

describe("manual inventory movements on isolated PostgreSQL", () => {
  it.runIf(disposable)("records zero adjustment as signed -10 and serializes other stock changes", async () => {
    const { prisma } = await import("@/lib/db");
    const { applyManualInventoryMovement } = await import("./manual-inventory-movement");
    const tag = randomUUID().slice(0, 10);
    const tenant = await prisma.tenant.create({
      data: { slug: "ci-adjust-" + tag, name: "CI adjustment test" },
    });
    const other = await prisma.tenant.create({
      data: { slug: "ci-adjust-other-" + tag, name: "CI other tenant" },
    });
    try {
      const item = await prisma.item.create({
        data: { tenantId: tenant.id, code: "CI-ADJUST", name: "CI counted SKU", stock: 10 },
      });
      const strangerItem = await prisma.item.create({
        data: { tenantId: other.id, code: "CI-ADJUST", name: "Other stock", stock: 99 },
      });
      const submit = async (type: "INBOUND" | "OUTBOUND" | "ADJUSTMENT",
        quantity: number, itemId = item.id, tenantId = tenant.id) => {
        const parsed = parseManualInventoryInput({
          itemId, type, quantity: String(quantity), reference: "", note: "",
        });
        await applyManualInventoryMovement({ ...parsed, tenantId, userId: "ci-test-operator" });
      };

      await submit("ADJUSTMENT", 0);
      const adjusted = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
      expect(adjusted.stock).toBe(0);
      const first = await prisma.inventoryMovement.findFirstOrThrow({
        where: { tenantId: tenant.id, itemId: item.id },
      });
      expect(first).toMatchObject({
        type: "ADJUSTMENT", quantity: -10, balance: 0,
        createdBy: "ci-test-operator",
      });

      await expect(submit("ADJUSTMENT", 0)).rejects.toThrow("同じ");
      await expect(submit("OUTBOUND", 1)).rejects.toThrow("在庫");
      await expect(submit("INBOUND", 1, item.id, other.id)).rejects.toThrow("商品");
      expect((await prisma.item.findUniqueOrThrow({ where: { id: strangerItem.id } })).stock).toBe(99);

      await submit("INBOUND", 5);
      await submit("OUTBOUND", 5);
      expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).stock).toBe(0);

      await submit("INBOUND", 10);
      // Both writers begin with stock=10; serializable CAS permits at most one
      // 6-unit outbound, preventing a stale negative balance or double count.
      const results = await Promise.allSettled([
        submit("OUTBOUND", 6),
        submit("OUTBOUND", 6),
      ]);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
      const final = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
      expect(final.stock).toBe(4);
      const movements = await prisma.inventoryMovement.findMany({
        where: { tenantId: tenant.id, itemId: item.id },
        orderBy: { createdAt: "asc" },
      });
      expect(movements).toHaveLength(5);
      expect(movements.reduce((sum, movement) =>
        sum + (movement.type === "OUTBOUND" ? -movement.quantity : movement.quantity), 10)).toBe(4);
      expect(movements[movements.length - 1].balance).toBe(4);
    } finally {
      await prisma.inventoryMovement.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.item.deleteMany({ where: { tenantId: { in: [tenant.id, other.id] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, other.id] } } });
    }
  }, 45000);
});
