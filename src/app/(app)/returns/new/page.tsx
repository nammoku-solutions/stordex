import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { b2bReturnFormsEnabled } from "@/lib/b2b-return-feature";
import { ReturnSubmitForm } from "../ReturnSubmitForm";

export const dynamic = "force-dynamic";

export default async function B2BReturnNewPage({ searchParams }: {
  searchParams: Promise<{ purchaseOrderId?: string }>;
}) {
  if (!b2bReturnFormsEnabled()) notFound();
  const { tenantId, role } = await requireTenant();
  const { purchaseOrderId } = await searchParams;
  if (!purchaseOrderId || typeof purchaseOrderId !== "string") notFound();
  const company = await prisma.intercompanyOrder.findFirst({
    where: { purchaseOrderId, buyerTenantId: tenantId },
    include: {
      connection: { select: { status: true } },
      purchaseOrder: {
        select: {
          tenantId: true, poNumber: true, status: true,
          items: { select: {
            id: true, itemName: true, quantity: true, received: true, unit: true,
          } },
        },
      },
      sellerOrder: {
        select: { status: true, items: {
          select: { id: true, orderId: true, quantity: true, unit: true },
        } },
      },
      items: true,
    },
  });
  if (!company) notFound();
  const canManage = role === "OWNER" || role === "ADMIN";
  const ready = company.status === "ACCEPTED" &&
    company.connection.status === "ACTIVE" &&
    company.purchaseOrder.status === "RECEIVED" &&
    !!company.sellerOrder &&
    (company.sellerOrder.status === "SHIPPED" ||
     company.sellerOrder.status === "COMPLETED");
  const poById = new Map(company.purchaseOrder.items.map(l => [l.id, l]));
  const sellerById = new Map(company.sellerOrder?.items.map(l => [l.id, l]) ?? []);
  const lines = company.items.map(line => {
    const buyerLine = poById.get(line.sourcePurchaseOrderItemId);
    const sellerLine = line.sellerOrderItemId
      ? sellerById.get(line.sellerOrderItemId) : undefined;
    return {
      sourceLineId: line.id,
      itemName: buyerLine?.itemName ?? line.itemName,
      ordered: buyerLine?.quantity ?? line.quantity,
      received: buyerLine?.received ?? 0,
      unit: buyerLine?.unit ?? line.unit,
      verifiedSellerLine: !!buyerLine && !!sellerLine &&
        sellerLine.quantity === line.quantity &&
        buyerLine.quantity === line.quantity &&
        sellerLine.unit === line.unit && buyerLine.unit === line.unit,
    };
  });
  return (
    <>
      <PageHeader title="企業間返品を申請"
        description={`仕入発注 ${company.purchaseOrder.poNumber}`}
        action={<Link href={`/purchase-orders/${company.purchaseOrderId}`}
          className="btn-secondary">発注詳細に戻る</Link>}/>
      {!canManage ? (
        <p className="card p-5 text-sm text-red-800">
          返品申請にはこの企業の管理者（OWNER・ADMIN）権限が必要です。
        </p>
      ) : !ready ? (
        <p className="card p-5 text-sm text-amber-900" role="status">
          申請の前提となる企業間連携・売り手の出荷・買い手の入荷確定が揃っていません。
          状態を確認してください。
        </p>
      ) : (
        <ReturnSubmitForm companyId={company.id} idempotencyKey={randomUUID()} lines={lines}/>
      )}
    </>
  );
}
