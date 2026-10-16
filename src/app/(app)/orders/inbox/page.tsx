import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen, ORDER_STATUS_LABEL } from "@/lib/format";
import { PO_STATUS_LABEL } from "../../purchase-orders/_status";

export const dynamic = "force-dynamic";

const labels: Record<string, string> = {
  SENT: "未処理（内容確認待ち）",
  ACCEPTED: "受注登録済み",
  REJECTED: "受注辞退",
  CANCELLED: "発注者が取消",
};

export default async function InboundOrdersPage() {
  const { tenantId } = await requireTenant();
  const records = await prisma.intercompanyOrder.findMany({
    where: { sellerTenantId: tenantId },
    include: {
      buyer: { select: { name: true, slug: true } },
      sellerOrder: { select: { id: true, orderNumber: true, status: true } },
      purchaseOrder: { select: { status: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader
        title="企業間受注・受信トレイ"
        description="取引先企業から届いた発注書を確認し、自社の受注に取り込みます"
      />
      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>受信日</th><th>発注元</th><th>相手の発注番号</th>
              <th className="text-right">明細</th>
              <th className="text-right">合計</th><th>状態</th><th></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td className="text-xs">{dateJP(r.createdAt)}</td>
                <td>{r.buyer.name}</td>
                <td className="font-mono">{r.poNumber}</td>
                <td className="text-right">{r._count.items}</td>
                <td className="text-right">{yen(r.total)}</td>
                <td>{labels[r.status] ?? r.status}
                  {r.sellerOrder && <div className="text-xs text-slate-500">
                    自社受注: {r.sellerOrder.orderNumber} / {ORDER_STATUS_LABEL[r.sellerOrder.status]}
                  </div>}
                  <div className="text-xs text-slate-500">
                    先方の発注: {PO_STATUS_LABEL[r.purchaseOrder.status]}
                  </div>
                </td>
                <td><Link href={`/orders/inbox/${r.id}`} className="text-blue-700 underline">内容を見る</Link></td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-500 py-8">受信した企業間発注はありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
