import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { lockCompanyConnection } from "@/lib/b2b-locks";

/** Map seller-local product/customer data and accept a source PO exactly once. */
export async function acceptCompanyPurchaseOrder({
  tenantId, formData,
}: { tenantId: string; formData: FormData }): Promise<string> {
  const inboundId = String(formData.get("inboundId") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  if (!inboundId || !customerId) throw new Error("受信発注または得意先が不明です");
  const sellerOrderId = await prisma.$transaction(async (tx) => {
    const incoming = await tx.intercompanyOrder.findFirst({
      where: { id: inboundId, sellerTenantId: tenantId, status: "SENT" },
      include: { items: true, connection: true, purchaseOrder: { select: { status: true } } },
    });
    if (!incoming) throw new Error("未処理の企業間発注がありません");
    // Ensure a connection revocation cannot pass an earlier stale ACTIVE read.
    await lockCompanyConnection(tx, incoming.connectionId);
    const refreshedLink = await tx.tradingConnection.findUnique({
      where: { id: incoming.connectionId }, select: { status: true },
    });
    if (refreshedLink?.status !== "ACTIVE" ||
        incoming.purchaseOrder.status !== "ORDERED") {
      throw new Error("企業間接続または発注書の状態が変わりました");
    }
    if (incoming.items.length === 0) throw new Error("明細がありません");

    const customer = await tx.customer.findFirst({
      where: { id: customerId, tenantId, active: true },
      select: { id: true },
    });
    if (!customer) throw new Error("自社の有効な得意先を選択してください");

    const mapped = incoming.items.map((line) => ({
      line,
      itemId: String(formData.get(`item_${line.id}`) ?? ""),
    }));
    if (mapped.some(({ itemId }) => !itemId)) {
      throw new Error("全明細に自社の商品を割り当ててください");
    }
    const itemIds = [...new Set(mapped.map((r) => r.itemId))];
    const products = await tx.item.findMany({
      where: { tenantId, id: { in: itemIds }, active: true },
      select: { id: true, name: true, code: true, unit: true, costPrice: true },
    });
    if (products.length !== itemIds.length)
      throw new Error("他社の商品、または無効な商品が選択されています");
    const productMap = new Map(products.map((product) => [product.id, product]));
    for (const { line, itemId } of mapped) {
      if (productMap.get(itemId)?.unit !== line.unit) {
        throw new Error(`商品「${line.itemName}」の単位が一致しません。対応商品を確認してください`);
      }
    }

    // Claim first within the transaction. Concurrent accepts cannot create two orders.
    const claimed = await tx.intercompanyOrder.updateMany({
      where: { id: incoming.id, sellerTenantId: tenantId, status: "SENT" },
      data: { status: "ACCEPTED" },
    });
    if (claimed.count !== 1) throw new Error("別の担当者がすでに処理しました");

    const orderNumber = await nextDocumentNumber(tx, tenantId, "SO");

    const order = await tx.order.create({
      data: {
        tenantId,
        orderNumber,
        customerId,
        orderDate: incoming.orderDate,
        dueDate: incoming.deliveryDate,
        status: "DRAFT",
        subtotal: incoming.subtotal,
        taxRate: incoming.taxRate,
        tax: incoming.tax,
        total: incoming.total,
        orderer: incoming.poNumber,
        note: `企業間発注 ${incoming.poNumber}${incoming.note ? "\n" + incoming.note : ""}`,
        items: {
          create: mapped.map(({ line, itemId }) => {
            const product = productMap.get(itemId)!;
            return {
              itemId,
              itemName: product.name,
              unit: product.unit,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              costPrice: product.costPrice,
              amount: line.amount,
            };
          }),
        },
      },
      select: { id: true },
    });
    await tx.intercompanyOrder.update({
      where: { id: incoming.id },
      data: { sellerOrderId: order.id },
    });
    return order.id;
  });
  return sellerOrderId;
}
