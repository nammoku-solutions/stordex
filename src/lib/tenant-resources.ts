import { prisma } from "@/lib/db";

export async function assertTenantCustomer(tenantId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { id: true },
  });
  if (!customer) throw new Error("顧客が見つかりません");
}

export async function assertTenantSupplier(tenantId: string, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId },
    select: { id: true },
  });
  if (!supplier) throw new Error("仕入先が見つかりません");
}

export async function assertTenantBusinessUnit(tenantId: string, businessUnitId: string) {
  const businessUnit = await prisma.businessUnit.findFirst({
    where: { id: businessUnitId, tenantId },
    select: { id: true },
  });
  if (!businessUnit) throw new Error("事業所が見つかりません");
}

export async function assertTenantItems(tenantId: string, itemIds: string[]) {
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const items = await prisma.item.findMany({
    where: { tenantId, id: { in: uniqueIds } },
    select: { id: true },
  });
  if (items.length !== uniqueIds.length) {
    throw new Error("商品が見つかりません");
  }
}
