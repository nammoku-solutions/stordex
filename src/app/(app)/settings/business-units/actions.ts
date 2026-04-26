"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";

const Schema = z.object({
  name: z.string().min(1).max(120),
  postalCode: z.string().max(20).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  fax: z.string().max(40).optional().nullable(),
  email: z.string().email().or(z.literal("")).optional().nullable(),
  bankInfo: z.string().max(500).optional().nullable(),
  isDefault: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

function parse(formData: FormData) {
  const obj = Object.fromEntries(formData.entries()) as Record<string, string>;
  const data = Schema.parse(obj);
  return {
    name: data.name,
    postalCode: data.postalCode || null,
    address: data.address || null,
    phone: data.phone || null,
    fax: data.fax || null,
    email: data.email || null,
    bankInfo: data.bankInfo || null,
    isDefault: data.isDefault ?? false,
  };
}

export async function createBusinessUnit(formData: FormData) {
  const { tenantId } = await requireTenant();
  const data = parse(formData);
  if (data.isDefault) {
    await prisma.businessUnit.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }
  await prisma.businessUnit.create({ data: { tenantId, ...data } });
  revalidatePath("/settings/business-units");
  redirect("/settings/business-units");
}

export async function updateBusinessUnit(id: string, formData: FormData) {
  const { tenantId } = await requireTenant();
  const data = parse(formData);
  if (data.isDefault) {
    await prisma.businessUnit.updateMany({
      where: { tenantId, isDefault: true, NOT: { id } },
      data: { isDefault: false },
    });
  }
  await prisma.businessUnit.updateMany({ where: { id, tenantId }, data });
  revalidatePath("/settings/business-units");
  redirect("/settings/business-units");
}

export async function deleteBusinessUnit(id: string) {
  const { tenantId } = await requireTenant();
  await prisma.businessUnit.deleteMany({ where: { id, tenantId } });
  revalidatePath("/settings/business-units");
}
