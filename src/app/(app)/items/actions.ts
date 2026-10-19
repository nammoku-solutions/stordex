"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { assertTenantSupplier } from "@/lib/tenant-resources";

const Schema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  nameKana: z.string().max(120).optional().nullable(),
  unit: z.string().min(1).max(20).default("個"),
  reorderPoint: z.coerce.number().int().min(0).default(0),
  stockPolicy: z.enum(["STOCKED", "ON_DEMAND"]).default("STOCKED"),
  purchaseMode: z.enum(["UNIT", "PACK"]).default("UNIT"),
  caseQty: z.number().int().min(0).nullable().optional(),
  orderUnit: z.string().trim().max(20).nullable().optional(),
  costPrice: z.coerce.number().int().min(0).default(0),
  salesPrice: z.coerce.number().int().min(0).default(0),
  supplierId: z.string().optional().nullable(),
  category: z.string().max(60).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

function parseForm(formData: FormData) {
  const obj = Object.fromEntries(formData.entries()) as Record<string, string>;
  const data = Schema.parse({
    code: obj.code?.trim(),
    name: obj.name?.trim(),
    nameKana: obj.nameKana || null,
    unit: obj.unit || "個",
    reorderPoint: obj.reorderPoint || 0,
    stockPolicy: obj.stockPolicy || "STOCKED",
    purchaseMode: obj.purchaseMode || "UNIT",
    caseQty: obj.caseQty?.trim() ? Number(obj.caseQty) : null,
    orderUnit: obj.orderUnit?.trim() || null,
    costPrice: obj.costPrice || 0,
    salesPrice: obj.salesPrice || 0,
    supplierId: obj.supplierId || null,
    category: obj.category || null,
    note: obj.note || null,
  });
  if (data.purchaseMode === "PACK" && (!data.caseQty || data.caseQty < 2 || !data.orderUnit)) {
    throw new Error("パック仕入の商品には1パックの入数（2以上）と単位名（パック・箱など）が必要です");
  }
  // The reorder point remains a stored preference, but dashboard alerts
  // only apply to STOCKED goods; on-demand goods never trigger reorder alerts.
  return data;
}

async function validateSupplier(tenantId: string, supplierId: string | null | undefined) {
  if (supplierId) await assertTenantSupplier(tenantId, supplierId);
}

export async function createItem(formData: FormData) {
  const { tenantId } = await requireTenant();
  const data = parseForm(formData);
  await validateSupplier(tenantId, data.supplierId);
  await prisma.item.create({
    data: { ...data, supplierId: data.supplierId || null, tenantId },
  });
  revalidatePath("/items");
  redirect("/items");
}

export async function updateItem(id: string, formData: FormData) {
  const { tenantId } = await requireTenant();
  const data = parseForm(formData);
  await validateSupplier(tenantId, data.supplierId);
  const result = await prisma.item.updateMany({
    where: { id, tenantId },
    data: { ...data, supplierId: data.supplierId || null },
  });
  if (result.count === 0) throw new Error("対象が見つかりません");
  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  redirect("/items");
}

export async function deleteItem(id: string) {
  const { tenantId } = await requireTenant();
  await prisma.item.deleteMany({ where: { id, tenantId } });
  revalidatePath("/items");
}
