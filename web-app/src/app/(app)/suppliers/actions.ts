"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";

const Schema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  nameKana: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  fax: z.string().max(40).optional().nullable(),
  email: z.string().email().max(120).optional().or(z.literal("")).nullable(),
  contact: z.string().max(80).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

function parseForm(formData: FormData) {
  const obj = Object.fromEntries(formData.entries()) as Record<string, string>;
  return Schema.parse({
    code: obj.code?.trim(),
    name: obj.name?.trim(),
    nameKana: obj.nameKana || null,
    postalCode: obj.postalCode || null,
    address: obj.address || null,
    phone: obj.phone || null,
    fax: obj.fax || null,
    email: obj.email || null,
    contact: obj.contact || null,
    note: obj.note || null,
  });
}

export async function createSupplier(formData: FormData) {
  const { tenantId } = await requireTenant();
  const data = parseForm(formData);
  await prisma.supplier.create({
    data: { ...data, email: data.email || null, tenantId },
  });
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function updateSupplier(id: string, formData: FormData) {
  const { tenantId } = await requireTenant();
  const data = parseForm(formData);
  const result = await prisma.supplier.updateMany({
    where: { id, tenantId },
    data: { ...data, email: data.email || null },
  });
  if (result.count === 0) throw new Error("対象が見つかりません");
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  redirect("/suppliers");
}

export async function deleteSupplier(id: string) {
  const { tenantId } = await requireTenant();
  await prisma.supplier.deleteMany({ where: { id, tenantId } });
  revalidatePath("/suppliers");
}
