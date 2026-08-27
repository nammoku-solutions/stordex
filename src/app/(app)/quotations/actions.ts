"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { assertTenantCustomer, assertTenantItems } from "@/lib/tenant-resources";
import type { QuotationStatus } from "@prisma/client";

const Line = z.object({
  itemId: z.string().optional().nullable(),
  itemName: z.string().min(1).max(120),
  spec: z.string().max(80).optional().nullable(),
  unit: z.string().max(20).default("個"),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().int().min(0),
});

const Schema = z.object({
  customerId: z.string().min(1),
  issueDate: z.string().min(1),
  validUntil: z.string().optional().nullable(),
  taxRate: z.coerce.number().int().min(0).max(100).default(10),
  contactName: z.string().max(80).optional().nullable(),
  contactPhone: z.string().max(40).optional().nullable(),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]).default("DRAFT"),
  note: z.string().max(1000).optional().nullable(),
  lines: z.array(Line).min(1, "明細が必要です"),
});

function parseQuotation(formData: FormData) {
  const obj = Object.fromEntries(formData.entries()) as Record<string, string>;
  let lines: unknown = [];
  try {
    lines = JSON.parse(obj.lines || "[]");
  } catch {}
  return Schema.parse({
    customerId: obj.customerId,
    issueDate: obj.issueDate,
    validUntil: obj.validUntil || null,
    taxRate: obj.taxRate || 10,
    contactName: obj.contactName || null,
    contactPhone: obj.contactPhone || null,
    status: (obj.status as QuotationStatus) || "DRAFT",
    note: obj.note || null,
    lines,
  });
}

async function nextQuotationNumber(tenantId: string) {
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(
    today.getDate()
  ).padStart(2, "0")}`;
  const prefix = `Q-${ymd}-`;
  const last = await prisma.quotation.findFirst({
    where: { tenantId, quotationNumber: { startsWith: prefix } },
    orderBy: { quotationNumber: "desc" },
    select: { quotationNumber: true },
  });
  const seq = last ? parseInt(last.quotationNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createQuotation(formData: FormData) {
  const { tenantId } = await requireTenant();
  const data = parseQuotation(formData);
  await assertTenantCustomer(tenantId, data.customerId);
  await assertTenantItems(
    tenantId,
    data.lines.flatMap((line) => (line.itemId ? [line.itemId] : []))
  );

  let subtotal = 0;
  const lineRecords = data.lines.map((l) => {
    const amount = l.quantity * l.unitPrice;
    subtotal += amount;
    return {
      itemId: l.itemId || null,
      itemName: l.itemName,
      spec: l.spec || null,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount,
    };
  });
  const tax = Math.floor((subtotal * data.taxRate) / 100);
  const total = subtotal + tax;
  const quotationNumber = await nextQuotationNumber(tenantId);

  const quotation = await prisma.quotation.create({
    data: {
      tenantId,
      quotationNumber,
      customerId: data.customerId,
      issueDate: new Date(data.issueDate),
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      status: data.status,
      subtotal,
      taxRate: data.taxRate,
      tax,
      total,
      contactName: data.contactName,
      contactPhone: data.contactPhone,
      note: data.note,
      items: { create: lineRecords },
    },
  });

  revalidatePath("/quotations");
  redirect(`/quotations/${quotation.id}`);
}

export async function setQuotationStatus(id: string, status: QuotationStatus) {
  const { tenantId } = await requireTenant();
  await prisma.quotation.updateMany({
    where: { id, tenantId },
    data: { status },
  });
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
}

export async function deleteQuotation(id: string) {
  const { tenantId } = await requireTenant();
  await prisma.quotation.deleteMany({ where: { id, tenantId } });
  revalidatePath("/quotations");
}
