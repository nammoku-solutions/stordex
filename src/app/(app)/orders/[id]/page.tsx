import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen, num, ORDER_STATUS_LABEL, ORDER_STATUS_BADGE } from "@/lib/format";
import { OrderStatusActions } from "./OrderStatusActions";

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const { tenantId } = await requireTenant();
  const order = await prisma.order.findFirst({
    where: { id: params.id, tenantId },
    include: { customer: true, items: true, linkedCompanyOrder: { select: { id: true } } },
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

      <OrderStatusActions orderId={order.id} status={order.status} linkedCompanyOrder={!!order.linkedCompanyOrder} />
    </>
  );
}
