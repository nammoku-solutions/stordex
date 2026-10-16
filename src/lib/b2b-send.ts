import { prisma } from "@/lib/db";
import { orderedTenantPair } from "@/lib/trading-connections";
import { lockBuyerPurchaseOrder, lockCompanyConnection } from "@/lib/b2b-locks";

/** Send and snapshot an ORDERED buyer PO exactly once, under its row lock. */
export async function sendOrderToCompany({
  tenantId, partnerId, purchaseOrderId,
}: {
  tenantId: string; partnerId: string; purchaseOrderId: string;
}): Promise<void> {
  if (!purchaseOrderId || !partnerId || tenantId === partnerId) {
    throw new Error("送信先または発注書の指定が不正です");
  }
  const [tenantAId, tenantBId] = orderedTenantPair(tenantId, partnerId);
  await prisma.$transaction(async (tx) => {
    // Buyer cancellation and send must make decisions from the same locked PO row.
    await lockBuyerPurchaseOrder(tx, tenantId, purchaseOrderId);
    const connectionRef = await tx.tradingConnection.findUnique({
      where: { tenantAId_tenantBId: { tenantAId, tenantBId } },
      select: { id: true },
    });
    if (!connectionRef) throw new Error("両社の企業間接続がありません");
    await lockCompanyConnection(tx, connectionRef.id);
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
}
