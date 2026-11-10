"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { assertTenantBusinessUnit, assertTenantCustomer } from "@/lib/tenant-resources";
import type { InvoiceStatus } from "@/generated/prisma/client";
import {
  allowedInvoiceTransition, canDeleteInvoice, mayManageInvoices,
} from "@/lib/invoice-status-policy";

function ensureInvoiceManager(role: string): void {
  if (!mayManageInvoices(role)) {
    throw new Error("請求書の作成・発行・変更・削除には管理者権限が必要です");
  }
}

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
  const { tenantId, role } = await requireTenant();
  ensureInvoiceManager(role);
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
  const { tenantId, role } = await requireTenant();
  ensureInvoiceManager(role);

  await prisma.$transaction(async tx => {
    // Serialization with CreditNote's Invoice FOR UPDATE guard prevents
    // issuing/cancelling while an invoice-linked draft is being prepared.
    const rows = await tx.$queryRaw<{ id: string; status: InvoiceStatus }[]>`
      SELECT id, status FROM "Invoice"
      WHERE id = ${id} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    if (rows.length !== 1) throw new Error("対象の請求書が見つかりません");
    const current = rows[0].status;
    if (!allowedInvoiceTransition(current, status)) {
      throw new Error("現在の請求書状態から指定された状態には変更できません");
    }
    if (status === "CANCELLED") {
      const creditCount = await tx.b2BCreditNote.count({
        where: { originalInvoiceId: id },
      });
      if (creditCount !== 0) {
        throw new Error("クレジットノート下書きに紐づく元請求書は無効化できません");
      }
    }
    const updated = await tx.invoice.updateMany({
      where: { id, tenantId, status: current }, data: { status },
    });
    if (updated.count !== 1) throw new Error("請求書が同時に変更されました");
  }, { isolationLevel: "Serializable", timeout: 15000 });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}

export async function deleteInvoice(id: string) {
  const { tenantId, role } = await requireTenant();
  ensureInvoiceManager(role);

  await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string; status: InvoiceStatus }[]>`
      SELECT id, status FROM "Invoice"
      WHERE id = ${id} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    if (rows.length !== 1) throw new Error("対象の請求書が見つかりません");
    if (!canDeleteInvoice(rows[0].status)) {
      throw new Error("発行済み・入金済み・無効化済み請求書は削除できません");
    }
    const count = await tx.b2BCreditNote.count({
      where: { originalInvoiceId: id },
    });
    if (count !== 0) throw new Error("CreditNoteと紐づく元請求書は削除できません");
    const deleted = await tx.invoice.deleteMany({
      where: { id, tenantId, status: "DRAFT" },
    });
    if (deleted.count !== 1) throw new Error("請求書が同時に変更されました");
  }, { isolationLevel: "Serializable", timeout: 15000 });
  revalidatePath("/invoices");
}
