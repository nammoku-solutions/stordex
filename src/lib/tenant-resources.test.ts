import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  assertTenantBusinessUnit,
  assertTenantCustomer,
  assertTenantItems,
  assertTenantSupplier,
} from "./tenant-resources";

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findFirst: vi.fn() },
    supplier: { findFirst: vi.fn() },
    businessUnit: { findFirst: vi.fn() },
    item: { findMany: vi.fn() },
  },
}));

describe("tenant resource guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a customer owned by the current tenant", async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({ id: "customer-1" } as never);

    await expect(assertTenantCustomer("tenant-a", "customer-1")).resolves.toBeUndefined();
    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { id: "customer-1", tenantId: "tenant-a" },
      select: { id: true },
    });
  });

  it("rejects a customer outside the current tenant", async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);
    await expect(assertTenantCustomer("tenant-a", "customer-b")).rejects.toThrow(
      "顧客が見つかりません"
    );
  });

  it("rejects a supplier outside the current tenant", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(null);
    await expect(assertTenantSupplier("tenant-a", "supplier-b")).rejects.toThrow(
      "仕入先が見つかりません"
    );
  });

  it("rejects a business unit outside the current tenant", async () => {
    vi.mocked(prisma.businessUnit.findFirst).mockResolvedValue(null);
    await expect(assertTenantBusinessUnit("tenant-a", "unit-b")).rejects.toThrow(
      "事業所が見つかりません"
    );
  });

  it("accepts only when every referenced item belongs to the tenant", async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([
      { id: "item-1" },
      { id: "item-2" },
    ] as never);

    await expect(
      assertTenantItems("tenant-a", ["item-1", "item-2", "item-1"])
    ).resolves.toBeUndefined();
    expect(prisma.item.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", id: { in: ["item-1", "item-2"] } },
      select: { id: true },
    });
  });

  it("rejects when any referenced item is outside the tenant", async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([{ id: "item-1" }] as never);
    await expect(assertTenantItems("tenant-a", ["item-1", "item-b"])).rejects.toThrow(
      "商品が見つかりません"
    );
  });
});
