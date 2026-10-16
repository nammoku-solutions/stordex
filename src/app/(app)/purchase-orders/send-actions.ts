"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { orderedTenantPair } from "@/lib/trading-connections";

export async function sendPurchaseOrderToPartner(formData: FormData) {
  const { tenantId, role } = await requireTenant();
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new Error("企業間への発注送信には管理者権限が必要です");
  }
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  const partnerId = String(formData.get("partnerId") ?? "");
  if (!purchaseOrderId || !partnerId || partnerId === tenantId ||
      formData.get("confirmRecipient") !== "yes") {
    throw new Error("発注先企業を確認し、送信内容を承認してください");
  }
  const [tenantAId, tenantBId] = orderedTenantPair(tenantId, partnerId);

  await prisma.$transaction(async (tx) => {
    const link = await tx.tradingConnection.findUnique({
      where: { tenantAId_tenantBId: { tenantAId, tenantBId } },
      include: { tenantA: { select: { status: true } }, tenantB: { select: { status: true } } },
    });
    if (!link || link.status !== "ACTIVE" || link.tenantA.status !== "ACTIVE" ||
        link.tenantB.status !== "ACTIVE") {
      throw new Error("両社の企業間接続が有効ではありません");
    }

    const po = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId, status: "ORDERED" },
      include: { items: { include: { item: { select: { code: true } } } } },
    });
    if (!po) throw new Error("送信できる発注書がありません。先に「発注済」にしてください");
    if (po.items.length === 0) throw new Error("明細がない発注は送信できません");
    if (po.items.some((line) => line.quantity <= 0 || line.unitPrice < 0))
      throw new Error("発注明細の数量または単価が不正です");
    const duplicate = await tx.intercompanyOrder.findUnique({
      where: { purchaseOrderId: po.id },
      select: { id: true },
    });
    if (duplicate) throw new Error("この発注書はすでに企業間送信済みです");

    await tx.intercompanyOrder.create({
      data: {
        connectionId: link.id,
        buyerTenantId: tenantId,
        sellerTenantId: partnerId,
        purchaseOrderId: po.id,
        poNumber: po.poNumber,
        orderDate: po.orderDate,
        deliveryDate: po.pickupDate,
        subtotal: po.subtotal,
        taxRate: po.taxRate,
        tax: po.tax,
        total: po.total,
        note: po.note,
        items: {
          create: po.items.map((line) => ({
            sourcePurchaseOrderItemId: line.id,
            buyerItemCode: line.item.code,
            itemName: line.itemName,
            unit: line.unit,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            amount: line.amount,
          })),
        },
      },
    });
  });

  revalidatePath("/purchase-orders");
  revalidatePath("/orders/inbox");
  revalidatePath(`/purchase-orders/${purchaseOrderId}`);
  redirect(`/purchase-orders/${purchaseOrderId}?sent=1`);
}
