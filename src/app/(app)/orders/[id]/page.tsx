import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen, num, ORDER_STATUS_LABEL, ORDER_STATUS_BADGE } from "@/lib/format";
import { OrderStatusActions } from "./OrderStatusActions";
import { PO_STATUS_LABEL } from "../../purchase-orders/_status";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId, role } = await requireTenant();
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, tenantId },
    include: { customer: true, items: true, linkedCompanyOrder: {
        include: {
          buyer: { select: { name: true } },
          purchaseOrder: { select: { poNumber: true, status: true } },
        },
      } },
  });
  if (!order) notFound();

  return (
    <>
      <PageHeader
        title={`注文 ${order.orderNumber}`}
        action={
          <div className="flex items-center gap-3">
            <Link
              href={`/print/orders/${order.id}`}
              target="_blank"
              className="btn-secondary"
            >
              納品書を印刷
            </Link>
            <Link
              href={`/print/orders/${order.id}/picking`}
              target="_blank"
              className="btn-secondary"
            >
              ピッキングリスト
            </Link>
            <span className={`badge ${ORDER_STATUS_BADGE[order.status]} text-sm`}>
              {ORDER_STATUS_LABEL[order.status]}
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs text-slate-500">得意先</div>
          <div className="font-medium">{order.customer.name}</div>
          <div className="text-xs text-slate-500 font-mono">{order.customer.code}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">注文日</div>
          <div className="font-medium">{dateJP(order.orderDate)}</div>
          <div className="text-xs text-slate-500">納期: {dateJP(order.dueDate)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">合計</div>
          <div className="text-xl font-bold">{yen(order.total)}</div>
          <div className="text-xs text-slate-500">
            小計 {yen(order.subtotal)} / 税 {yen(order.tax)}
          </div>
        </div>
      </div>

      <div className="card table-wrap mb-6">
        <table className="tbl">
          <thead>
            <tr>
              <th>商品</th>
              <th className="text-right">数量</th>
              <th className="text-right">単価</th>
              <th className="text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((l) => (
              <tr key={l.id}>
                <td>{l.itemName}</td>
                <td className="text-right">
                  {num(l.quantity)} {l.unit}
                </td>
                <td className="text-right">{yen(l.unitPrice)}</td>
                <td className="text-right font-medium">{yen(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {order.note && (
        <div className="card p-4 mb-6">
          <div className="text-xs text-slate-500 mb-1">備考</div>
          <div className="whitespace-pre-wrap text-sm">{order.note}</div>
        </div>
      )}

      {order.linkedCompanyOrder && (
        <section className="card p-5 mb-6 space-y-2" aria-label="企業間連携の進行状況">
          <h2 className="font-semibold text-lg">企業間取引の進行状況</h2>
          <p className="text-sm text-slate-600">
            先方の発注企業: {order.linkedCompanyOrder.buyer.name}
            （発注番号: {order.linkedCompanyOrder.purchaseOrder.poNumber}）
          </p>
          <p className="text-sm">
            自社受注: <strong>{ORDER_STATUS_LABEL[order.status]}</strong> ／
            相手の発注: <strong>{PO_STATUS_LABEL[order.linkedCompanyOrder.purchaseOrder.status]}</strong>
          </p>
          {order.status === "SHIPPED" && order.linkedCompanyOrder.purchaseOrder.status === "ORDERED" &&
            <p className="text-sm text-amber-800">
              出荷済みです。相手企業での入荷確定をお待ちください。
            </p>}
          {order.linkedCompanyOrder.purchaseOrder.status === "RECEIVED" &&
            <p className="text-sm text-emerald-700">発注企業で入荷が確定されました。</p>}
          {order.status === "CANCELLED" &&
            order.linkedCompanyOrder.purchaseOrder.status === "ORDERED" && (
              <p className="text-sm text-amber-800">
                自社受注は取消済みです。発注元企業に自社発注の取消も依頼してください。
              </p>
            )}
          {order.status === "CANCELLED" &&
            order.linkedCompanyOrder.purchaseOrder.status === "CANCELLED" && (
              <p className="text-sm text-emerald-700">
                発注元企業の発注も取消済みです。両社の取消処理が完了しました。
              </p>
            )}
          <p className="text-xs text-slate-500">
            これらは双方の伝票ステータスを参照した表示です。出荷や入荷を自動実行するものではありません。
          </p>
        </section>
      )}
      <OrderStatusActions orderId={order.id} status={order.status} linkedCompanyOrder={!!order.linkedCompanyOrder} canManageLinkedCancellation={role === "OWNER" || role === "ADMIN"} />
    </>
  );
}
