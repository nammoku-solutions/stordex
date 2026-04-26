import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen } from "@/lib/format";
import { PO_STATUS_LABEL as STATUS_LABEL, PO_STATUS_BADGE as STATUS_BADGE } from "./_status";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const { tenantId } = await requireTenant();
  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status?.trim() ?? "";
  const pos = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      ...(status ? { status: status as any } : {}),
      ...(q
        ? {
            OR: [
              { poNumber: { contains: q, mode: "insensitive" } },
              { supplier: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { supplier: true, items: { select: { id: true } } },
    orderBy: { orderDate: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="仕入先発注"
        description="仕入先への発注書を作成し、入荷時に自動で在庫へ反映します"
        action={
          <Link href="/purchase-orders/new" className="btn-primary">
            ＋ 新規発注
          </Link>
        }
      />
      <form className="mb-4 flex gap-2 flex-wrap" action="/purchase-orders">
        <input name="q" defaultValue={q} className="input max-w-sm" placeholder="番号・仕入先で検索" />
        <select name="status" defaultValue={status} className="input max-w-xs">
          <option value="">すべての状態</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="btn-secondary">検索</button>
      </form>
      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>発注番号</th>
              <th>発注日</th>
              <th>仕入先</th>
              <th>引取予定日</th>
              <th className="text-right">明細</th>
              <th className="text-right">合計</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {pos.map((p) => (
              <tr key={p.id}>
                <td className="font-mono">
                  <Link href={`/purchase-orders/${p.id}`} className="text-brand-600 hover:underline">
                    {p.poNumber}
                  </Link>
                </td>
                <td>{dateJP(p.orderDate)}</td>
                <td>{p.supplier.name}</td>
                <td>{dateJP(p.pickupDate)}</td>
                <td className="text-right">{p.items.length}</td>
                <td className="text-right font-medium">{yen(p.total)}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                </td>
              </tr>
            ))}
            {pos.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-500 py-8">
                  発注がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
