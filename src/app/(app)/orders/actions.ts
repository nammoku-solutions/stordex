"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { assertTenantCustomer } from "@/lib/tenant-resources";
import type { OrderStatus } from "@/generated/prisma/client";

const LineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().int().min(0),
});

const OrderSchema = z.object({
  customerId: z.string().min(1),
  orderDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  taxRate: z.coerce.number().int().min(0).max(100).default(10),
  status: z.enum(["DRAFT", "CONFIRMED", "SHIPPED", "COMPLETED", "CANCELLED"]).default("DRAFT"),
  note: z.string().max(1000).optional().nullable(),
  lines: z.array(LineSchema).min(1, "明細が必要です"),
});

function parseOrder(formData: FormData) {
  const obj = Object.fromEntries(formData.entries()) as Record<string, string>;
  let lines: unknown = [];
  try {
    lines = JSON.parse(obj.lines || "[]");
  } catch {
    lines = [];
  }
  return OrderSchema.parse({
    customerId: obj.customerId,
    orderDate: obj.orderDate,
    dueDate: obj.dueDate || null,
    taxRate: obj.taxRate || 10,
    status: (obj.status as OrderStatus) || "DRAFT",
    note: obj.note || null,
    lines,
  });
}

async function nextOrderNumber(tenantId: string) {
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(
    today.getDate()
  ).padStart(2, "0")}`;
  const prefix = `SO-${ymd}-`;
  const last = await prisma.order.findFirst({
    where: { tenantId, orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const seq = last ? parseInt(last.orderNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createOrder(formData: FormData) {
  const { tenantId, userId } = await requireTenant();
  const data = parseOrder(formData);
  await assertTenantCustomer(tenantId, data.customerId);

  const items = await prisma.item.findMany({
    where: { tenantId, id: { in: data.lines.map((l) => l.itemId) } },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));

  let subtotal = 0;
  const lineRecords = data.lines.map((l) => {
    const it = itemMap.get(l.itemId);
    if (!it) throw new Error("商品が見つかりません");
    const amount = l.quantity * l.unitPrice;
    subtotal += amount;
    return {
      itemId: it.id,
      itemName: it.name,
      unit: it.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount,
    };
  });
  const tax = Math.floor((subtotal * data.taxRate) / 100);
  const total = subtotal + tax;

  const orderNumber = await nextOrderNumber(tenantId);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        tenantId,
        orderNumber,
        customerId: data.customerId,
        orderDate: new Date(data.orderDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status: data.status,
        subtotal,
        taxRate: data.taxRate,
        tax,
        total,
        note: data.note,
        items: { create: lineRecords },
      },
    });

    if (
      data.status === "CONFIRMED" ||
      data.status === "SHIPPED" ||
      data.status === "COMPLETED"
    ) {
      for (const line of lineRecords) {
        const updated = await tx.item.update({
          where: { id: line.itemId },
          data: { stock: { decrement: line.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            itemId: line.itemId,
            type: "OUTBOUND",
            quantity: line.quantity,
            balance: updated.stock,
            reference: orderNumber,
            createdBy: userId,
          },
        });
      }
    }
    return created;
  });

  revalidatePath("/orders");
  revalidatePath("/items");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  redirect(`/orders/${order.id}`);
}

export async function setOrderStatus(orderId: string, status: OrderStatus) {
  const { tenantId, userId } = await requireTenant();

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });
    if (!order) throw new Error("注文が見つかりません");

    const wasOpen =
      order.status === "CONFIRMED" ||
      order.status === "SHIPPED" ||
      order.status === "COMPLETED";
    const willOpen =
      status === "CONFIRMED" || status === "SHIPPED" || status === "COMPLETED";

    if (wasOpen && status === "CANCELLED") {
      for (const line of order.items) {
        const updated = await tx.item.update({
          where: { id: line.itemId },
          data: { stock: { increment: line.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            itemId: line.itemId,
            type: "INBOUND",
            quantity: line.quantity,
            balance: updated.stock,
            reference: `${order.orderNumber} 取消`,
            createdBy: userId,
          },
        });
      }
    }
    if (!wasOpen && willOpen) {
      for (const line of order.items) {
        const updated = await tx.item.update({
          where: { id: line.itemId },
          data: { stock: { decrement: line.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            itemId: line.itemId,
            type: "OUTBOUND",
            quantity: line.quantity,
            balance: updated.stock,
            reference: order.orderNumber,
            createdBy: userId,
          },
        });
      }
    }

    await tx.order.update({ where: { id: orderId }, data: { status } });
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/items");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function deleteOrder(orderId: string) {
  const { tenantId } = await requireTenant();
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId } });
  if (!order) return;
  if (order.status !== "DRAFT" && order.status !== "CANCELLED") {
    throw new Error("確定済みの注文は削除できません。先に取消してください。");
  }
  await prisma.order.delete({ where: { id: orderId } });
  revalidatePath("/orders");
}
