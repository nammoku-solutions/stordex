"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { assertTenantSupplier } from "@/lib/tenant-resources";
import type { PurchaseOrderStatus } from "@/generated/prisma/client";

const Line = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1).max(120),
  unit: z.string().max(20).default("個"),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().int().min(0),
});

const Schema = z.object({
  supplierId: z.string().min(1),
  orderDate: z.string().min(1),
  pickupDate: z.string().optional().nullable(),
  taxRate: z.coerce.number().int().min(0).max(100).default(10),
  note: z.string().max(1000).optional().nullable(),
  lines: z.array(Line).min(1, "明細が必要です"),
});

function parsePO(formData: FormData) {
  const obj = Object.fromEntries(formData.entries()) as Record<string, string>;
  let lines: unknown = [];
  try {
    lines = JSON.parse(obj.lines || "[]");
  } catch {}
  return Schema.parse({
    supplierId: obj.supplierId,
    orderDate: obj.orderDate,
    pickupDate: obj.pickupDate || null,
    taxRate: obj.taxRate || 10,
    note: obj.note || null,
    lines,
  });
}

async function nextPONumber(tenantId: string) {
  const t = new Date();
  const ymd = `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}${String(
    t.getDate()
  ).padStart(2, "0")}`;
  const prefix = `P-${ymd}-`;
  const last = await prisma.purchaseOrder.findFirst({
    where: { tenantId, poNumber: { startsWith: prefix } },
    orderBy: { poNumber: "desc" },
    select: { poNumber: true },
  });
  const seq = last ? parseInt(last.poNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createPurchaseOrder(formData: FormData) {
  const { tenantId } = await requireTenant();
  const data = parsePO(formData);
  await assertTenantSupplier(tenantId, data.supplierId);

  const itemIds = data.lines.map((l) => l.itemId);
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds }, tenantId },
    select: { id: true },
  });
  if (items.length !== new Set(itemIds).size) {
    throw new Error("商品が無効です");
  }

  let subtotal = 0;
  const lineRecords = data.lines.map((l) => {
    const amount = l.quantity * l.unitPrice;
    subtotal += amount;
    return {
      itemId: l.itemId,
      itemName: l.itemName,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount,
      received: 0,
    };
  });
  const tax = Math.floor((subtotal * data.taxRate) / 100);
  const total = subtotal + tax;
  const poNumber = await nextPONumber(tenantId);

  const po = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      poNumber,
      supplierId: data.supplierId,
      orderDate: new Date(data.orderDate),
      pickupDate: data.pickupDate ? new Date(data.pickupDate) : null,
      status: "DRAFT",
      subtotal,
      taxRate: data.taxRate,
      tax,
      total,
      note: data.note,
      items: { create: lineRecords },
    },
  });

  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${po.id}`);
}

export async function setPurchaseOrderStatus(id: string, status: PurchaseOrderStatus) {
  const { tenantId, userId } = await requireTenant();

  await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: { items: true, linkedCompanyOrder: true },
    });
    if (!po) throw new Error("発注が見つかりません");
    if (po.status === status) return;
    const valid =
      (po.status === "DRAFT" && ["ORDERED", "CANCELLED"].includes(status)) ||
      (po.status === "ORDERED" && ["RECEIVED", "CANCELLED"].includes(status));
    if (!valid) throw new Error("許可されていない発注状態の変更です");

    const linked = po.linkedCompanyOrder;
    if (linked && status === "CANCELLED") {
      if (linked.status === "ACCEPTED") {
        throw new Error("受注企業がすでに承認しています。先方と調整してから取り消してください");
      }
      if (linked.status === "SENT") {
        const changed = await tx.intercompanyOrder.updateMany({
          where: { id: linked.id, buyerTenantId: tenantId, status: "SENT" },
          data: { status: "CANCELLED" },
        });
        if (changed.count !== 1) throw new Error("先方で注文が処理されたため取消できません");
      }
    }
    if (linked && status === "RECEIVED" && linked.status !== "ACCEPTED") {
      throw new Error("送信した企業間発注は、先方の受注登録後に入荷を確定してください");
    }

    // Conditional claim prevents repeated RECEIVE from incrementing inventory twice.
    const changed = await tx.purchaseOrder.updateMany({
      where: { id: po.id, tenantId, status: po.status },
      data: { status },
    });
    if (changed.count !== 1) throw new Error("発注が別の操作で変更されました");

    if (status === "RECEIVED") {
      for (const line of po.items) {
        const delta = line.quantity - line.received;
        if (delta <= 0) continue;
        const updated = await tx.item.update({
          where: { id: line.itemId, tenantId },
          data: { stock: { increment: delta } },
          select: { stock: true },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            itemId: line.itemId,
            type: "INBOUND",
            quantity: delta,
            balance: updated.stock,
            reference: po.poNumber,
            note: `仕入入庫: ${po.poNumber}`,
            createdBy: userId,
          },
        });
        await tx.purchaseOrderItem.update({
          where: { id: line.id },
          data: { received: line.quantity },
        });
      }
    }
  });
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/inventory");
  revalidatePath("/orders/inbox");
}

export async function deletePurchaseOrder(id: string) {
  const { tenantId } = await requireTenant();
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    select: { status: true, linkedCompanyOrder: { select: { id: true } } },
  });
  if (!po) return;
  if (po.linkedCompanyOrder) {
    throw new Error("企業間に送信した発注書は履歴保持のため削除できません");
  }
  if (po.status === "RECEIVED") {
    throw new Error("入荷済の発注は削除できません");
  }
  await prisma.purchaseOrder.deleteMany({ where: { id, tenantId } });
  revalidatePath("/purchase-orders");
}
