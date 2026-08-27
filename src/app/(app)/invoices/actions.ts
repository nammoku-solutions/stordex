"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { assertTenantBusinessUnit, assertTenantCustomer } from "@/lib/tenant-resources";
import type { InvoiceStatus } from "@prisma/client";

const Schema = z.object({
  customerId: z.string().min(1),
  businessUnitId: z.string().optional().nullable(),
  periodYear: z.coerce.number().int().min(2000).max(2100),
  periodMonth: z.coerce.number().int().min(1).max(12),
  dueDate: z.string().optional().nullable(),
  taxRate: z.coerce.number().int().min(0).max(100).default(10),
  taxPerOrder: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
  note: z.string().max(1000).optional().nullable(),
});

async function nextInvoiceNumber(tenantId: string, year: number, month: number) {
  const ym = `${year}${String(month).padStart(2, "0")}`;
  const prefix = `I-${ym}-`;
  const last = await prisma.invoice.findFirst({
    where: { tenantId, invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  const seq = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createInvoice(formData: FormData) {
  const { tenantId } = await requireTenant();
  const obj = Object.fromEntries(formData.entries()) as Record<string, string>;
  const data = Schema.parse(obj);
  await assertTenantCustomer(tenantId, data.customerId);
  if (data.businessUnitId) {
    await assertTenantBusinessUnit(tenantId, data.businessUnitId);
  }

  const periodStart = new Date(data.periodYear, data.periodMonth - 1, 1);
  const periodEnd = new Date(data.periodYear, data.periodMonth, 1);

  const billedOrderIds = await prisma.invoiceOrder.findMany({
    where: { invoice: { tenantId, customerId: data.customerId } },
    select: { orderId: true },
  });
  const excluded = billedOrderIds.map((b) => b.orderId);

  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      customerId: data.customerId,
      status: { in: ["CONFIRMED", "SHIPPED", "COMPLETED"] },
      id: { notIn: excluded },
      OR: [
        { dueDate: { gte: periodStart, lt: periodEnd } },
        {
          AND: [
            { dueDate: null },
            { orderDate: { gte: periodStart, lt: periodEnd } },
          ],
        },
      ],
    },
    select: { id: true, subtotal: true, tax: true, total: true },
  });

  if (orders.length === 0) {
    throw new Error("対象月に集計可能な受注がありません");
  }

  let subtotal = 0;
  let tax = 0;
  let total = 0;
  if (data.taxPerOrder) {
    for (const o of orders) {
      subtotal += o.subtotal;
      tax += o.tax;
      total += o.total;
    }
  } else {
    for (const o of orders) {
      subtotal += o.subtotal;
    }
    tax = Math.floor((subtotal * data.taxRate) / 100);
    total = subtotal + tax;
  }

  const invoiceNumber = await nextInvoiceNumber(tenantId, data.periodYear, data.periodMonth);
  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      invoiceNumber,
      customerId: data.customerId,
      businessUnitId: data.businessUnitId || null,
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      status: "DRAFT",
      subtotal,
      taxRate: data.taxRate,
      tax,
      total,
      taxPerOrder: data.taxPerOrder ?? false,
      note: data.note,
      orders: {
        create: orders.map((o) => ({ orderId: o.id })),
      },
    },
  });

  revalidatePath("/invoices");
  redirect(`/invoices/${invoice.id}`);
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus) {
  const { tenantId } = await requireTenant();
  await prisma.invoice.updateMany({ where: { id, tenantId }, data: { status } });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}

export async function deleteInvoice(id: string) {
  const { tenantId } = await requireTenant();
  await prisma.invoice.deleteMany({ where: { id, tenantId } });
  revalidatePath("/invoices");
}
