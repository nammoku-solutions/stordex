"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { assertTenantCustomer } from "@/lib/tenant-resources";
import type { OrderStatus } from "@/generated/prisma/client";
import { canTransitionOrder, requiresOutboundMovement, requiresReturnMovement } from "@/lib/order-transitions";
import { nextDocumentNumber } from "@/lib/document-numbering";

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
  status: z.enum(["DRAFT", "CONFIRMED"]).default("DRAFT"),
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

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await nextDocumentNumber(tx, tenantId, "SO");
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

    if (data.status === "CONFIRMED") {
      for (const line of lineRecords) {
        // Claim available stock atomically. Never create a negative balance.
        const changed = await tx.item.updateMany({
          where: { id: line.itemId, tenantId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (changed.count !== 1) {
          throw new Error("在庫不足または無効な商品です。数量を確認してください");
        }
        const updated = await tx.item.findUniqueOrThrow({
          where: { id: line.itemId },
          select: { stock: true },
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
    // Retrying the same operation must never repeat an inventory movement.
    if (order.status === status) return;
    if (!canTransitionOrder(order.status, status)) {
      throw new Error("許可されていない受注状態の変更です。画面を更新してください");
    }

    // Connected companies must coordinate cancellations and returns explicitly.
    // Until that workflow exists, do not silently reverse one side's stock.
    if (status === "CANCELLED") {
      const linked = await tx.intercompanyOrder.findUnique({
        where: { sellerOrderId: order.id },
        select: { id: true },
      });
      if (linked) {
        throw new Error("企業間の受注は個別に取り消せません。発注元と調整してください");
      }
    }

    // Compare-and-swap protects against duplicate clicks and parallel transitions.
    // A failed claim rolls back the entire transaction, including any movements.
    const claim = await tx.order.updateMany({
      where: { id: order.id, tenantId, status: order.status },
      data: { status },
    });
    if (claim.count !== 1) {
      throw new Error("別の担当者が注文を更新しました。画面を再読み込みしてください");
    }

    if (requiresOutboundMovement(order.status, status)) {
      for (const line of order.items) {
        const changed = await tx.item.updateMany({
          where: { id: line.itemId, tenantId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (changed.count !== 1) {
          throw new Error(`商品「${line.itemName}」の在庫が不足しています`);
        }
        const updated = await tx.item.findUniqueOrThrow({
          where: { id: line.itemId }, select: { stock: true },
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
    if (requiresReturnMovement(order.status, status)) {
      for (const line of order.items) {
        const updated = await tx.item.update({
          where: { id: line.itemId, tenantId },
          data: { stock: { increment: line.quantity } },
          select: { stock: true },
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
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/items");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/purchase-orders");
}

export async function deleteOrder(orderId: string) {
  const { tenantId } = await requireTenant();
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: { linkedCompanyOrder: { select: { id: true } } },
  });
  if (!order) return;
  if (order.linkedCompanyOrder) {
    throw new Error("企業間で受信した注文は履歴保持のため削除できません");
  }
  if (order.status !== "DRAFT" && order.status !== "CANCELLED") {
    throw new Error("確定済みの注文は削除できません。先に取消してください。");
  }
  await prisma.order.deleteMany({
    where: { id: orderId, tenantId, status: { in: ["DRAFT", "CANCELLED"] } },
  });
  revalidatePath("/orders");
}
