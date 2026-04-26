import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen, num } from "@/lib/format";
import { PO_STATUS_BADGE, PO_STATUS_LABEL } from "../_status";
import { POStatusActions } from "./POStatusActions";

export default async function POPage({ params }: { params: { id: string } }) {
  const { tenantId } = await requireTenant();
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: params.id, tenantId },
    include: { supplier: true, items: { include: { item: true } } },
  });
  if (!po) notFound();

  return (
    <>
      <PageHeader
        title={`発注 ${po.poNumber}`}
        action={
          <div className="flex items-center gap-3">
            <Link
              href={`/print/purchase-orders/${po.id}`}
              target="_blank"
              className="btn-secondary"
            >
              発注書を印刷
            </Link>
            <span className={`badge ${PO_STATUS_BADGE[po.status]} text-sm`}>
              {PO_STATUS_LABEL[po.status]}
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs text-slate-500">仕入先</div>
          <div className="font-medium">{po.supplier.name}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">発注日 / 引取予定日</div>
          <div>{dateJP(po.orderDate)} → {dateJP(po.pickupDate)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">合計</div>
          <div className="text-xl font-bold">{yen(po.total)}</div>
        </div>
      </div>

      <div className="card table-wrap mb-6">
        <table className="tbl">
          <thead>
            <tr>
              <th>商品コード</th>
              <th>商品名</th>
              <th className="text-right">数量</th>
              <th className="text-right">入荷済</th>
              <th className="text-right">単価</th>
              <th className="text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((l) => (
              <tr key={l.id}>
                <td className="font-mono">{l.item.code}</td>
                <td>{l.itemName}</td>
                <td className="text-right">{num(l.quantity)} {l.unit}</td>
                <td className="text-right">{num(l.received)}</td>
                <td className="text-right">{yen(l.unitPrice)}</td>
                <td className="text-right font-medium">{yen(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <POStatusActions id={po.id} status={po.status} />
    </>
  );
}
