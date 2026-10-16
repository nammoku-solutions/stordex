import type { Prisma } from "@/generated/prisma/client";

/**
 * Protect the buyer PO row for the entire transaction, including checks of
 * the optional IntercompanyOrder link. Prevents send-vs-cancel TOCTOU races.
 * All writers must acquire locks in the same order: PurchaseOrder -> TradingConnection.
 */
export async function lockBuyerPurchaseOrder(
  tx: Prisma.TransactionClient,
  tenantId: string,
  purchaseOrderId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "PurchaseOrder"
    WHERE id = ${purchaseOrderId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new Error("発注が見つかりません");
}

/** Revoke and new sends/acceptances must not cross silently. */
export async function lockCompanyConnection(
  tx: Prisma.TransactionClient,
  connectionId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "TradingConnection" WHERE id = ${connectionId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new Error("企業間接続が見つかりません");
}
