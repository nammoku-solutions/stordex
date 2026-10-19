"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { assertTenantSupplier } from "@/lib/tenant-resources";
import type { PurchaseOrderStatus } from "@/generated/prisma/client";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { applyPurchaseOrderStatus } from "@/lib/purchase-order-status";
import { purchaseLinePackSnapshot } from "@/lib/purchase-pack";

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

export async function createPurchaseOrder(formData: FormData) {
  const { tenantId } = await requireTenant();
  const data = parsePO(formData);
  await assertTenantSupplier(tenantId, data.supplierId);

  const itemIds = data.lines.map((l) => l.itemId);
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds }, tenantId },
    select: { id: true, unit: true, purchaseMode: true, caseQty: true, orderUnit: true, active: true },
  });
  if (items.length !== new Set(itemIds).size) {
    throw new Error("商品が無効です");
  }
  const itemMap = new Map(items.map((item) => [item.id, item]));
  for (const line of data.lines) {
    const item = itemMap.get(line.itemId);
    if (!item || !item.active || item.unit !== line.unit) {
      throw new Error("商品マスタの単位または状態が正しくありません");
    }
    purchaseLinePackSnapshot(item, line.quantity);
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
      ...purchaseLinePackSnapshot(itemMap.get(l.itemId)!, l.quantity),
    };
  });
  const tax = Math.floor((subtotal * data.taxRate) / 100);
  const total = subtotal + tax;
  const po = await prisma.$transaction(async (tx) => {
    const poNumber = await nextDocumentNumber(tx, tenantId, "P");
    return tx.purchaseOrder.create({
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
  });

  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${po.id}`);
}

export async function setPurchaseOrderStatus(id: string, status: PurchaseOrderStatus) {
  const { tenantId, userId, role } = await requireTenant();
  if (status === "CANCELLED" && role !== "OWNER" && role !== "ADMIN") {
    const linked = await prisma.intercompanyOrder.findFirst({
      where: { purchaseOrderId: id, buyerTenantId: tenantId },
      select: { id: true },
    });
    if (linked) throw new Error("企業間発注の取消には管理者権限が必要です");
  }
  await applyPurchaseOrderStatus({ tenantId, userId, id, status });
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/inventory");
  revalidatePath("/orders/inbox");
}

/**
 * Confirm physical receipt based on counted base-unit quantities, not only
 * the original purchase quantity. The transaction verifies every owned line.
 */
export async function confirmCountedPurchaseReceipt(id: string, formData: FormData) {
  const { tenantId, userId } = await requireTenant();
  const actualReceipts: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("received_")) continue;
    if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
      throw new Error("実入荷数量は0以上の整数で入力してください");
    }
    const lineId = key.slice("received_".length);
    if (!lineId || Object.hasOwn(actualReceipts, lineId)) {
      throw new Error("入荷明細が重複しています");
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number > 100000000) {
      throw new Error("入荷数が許容範囲を超えています");
    }
    actualReceipts[lineId] = number;
  }
  const reason = String(formData.get("discrepancyReason") || "").trim();
  await applyPurchaseOrderStatus({
    tenantId, userId, id, status: "RECEIVED",
    actualReceipts, discrepancyReason: reason,
  });
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
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
