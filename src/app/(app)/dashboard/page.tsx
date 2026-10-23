import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { belowMinimumStock, onDemandRemaining } from "@/lib/inventory-policy";
import {
  yen,
  num,
  dateJP,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_BADGE,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { tenantId, session } = await requireTenant();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    customerCount,
    itemCount,
    supplierCount,
    openOrders,
    monthAgg,
    lowItems,
    recentOrders,
  ] = await Promise.all([
    prisma.customer.count({ where: { tenantId, active: true } }),
    prisma.item.count({ where: { tenantId, active: true } }),
    prisma.supplier.count({ where: { tenantId, active: true } }),
    prisma.order.count({
      where: { tenantId, status: { in: ["DRAFT", "CONFIRMED", "SHIPPED"] } },
    }),
    prisma.order.aggregate({
      where: {
        tenantId,
        orderDate: { gte: startOfMonth },
        status: { not: "CANCELLED" },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.item.findMany({
      where: { tenantId, active: true, stockPolicy: "STOCKED", reorderPoint: { gt: 0 } },
      orderBy: { code: "asc" },
    }),
    prisma.order.findMany({
      where: { tenantId },
      include: { customer: true },
      orderBy: { orderDate: "desc" },
      take: 5,
    }),
  ]);

  const lowAlerts = belowMinimumStock(lowItems);
  const stockOnDemand = await prisma.item.findMany({
    where: { tenantId, active: true, stockPolicy: "ON_DEMAND" },
    orderBy: { code: "asc" },
  });
  // Draft sales demand is shown separately as a *planning estimate*. CONFIRMED
  // orders already depleted physical stock, so subtracting them again is wrong.
  const pendingDemand = stockOnDemand.length
    ? await prisma.orderItem.groupBy({
        by: ["itemId"],
        where: {
          itemId: { in: stockOnDemand.map(item => item.id) },
          order: { tenantId, status: "DRAFT" },
        },
        _sum: { quantity: true },
      }) : [];
  const onDemand = onDemandRemaining(
    stockOnDemand,
    new Map(pendingDemand.map(line => [line.itemId, line._sum.quantity ?? 0])),
  );
  const spareSkuCount = onDemand.filter(item => item.estimatedAvailable > 0).length;

  return (
    <>
      <PageHeader
        title={`おかえりなさい、${session.user.name || session.user.email}さん`}
        description={`${session.user.tenantName} のダッシュボード`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="得意先" value={num(customerCount)} href="/customers" />
        <Stat label="商品" value={num(itemCount)} href="/items" />
        <Stat label="仕入先" value={num(supplierCount)} href="/suppliers" />
        <Stat label="進行中の注文" value={num(openOrders)} href="/orders" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="card p-5">
          <div className="text-xs text-slate-500">今月の売上（税込）</div>
          <div className="text-2xl font-bold mt-1">
            {yen(monthAgg._sum.total ?? 0)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {num(monthAgg._count._all)} 件の注文
          </div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-slate-500">在庫アラート</div>
          <div className="text-2xl font-bold mt-1 text-red-600">
            {num(lowAlerts.length)}
          </div>
          <div className="text-xs text-slate-500 mt-1">最低在庫を下回った常備品</div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-slate-500">余剰在庫のある受注後仕入品</div>
          <div className="text-2xl font-bold mt-1 text-amber-700">
            {num(spareSkuCount)}
          </div>
          <div className="text-xs text-slate-500 mt-1">未確定の受注数量を考慮した参考値</div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-slate-500">クイックリンク</div>
          <div className="mt-2 flex flex-col gap-1 text-sm">
            <Link href="/orders/new" className="text-brand-600 hover:underline">
              ＋ 新規注文を作成
            </Link>
            <Link href="/inventory" className="text-brand-600 hover:underline">
              入出庫を記録
            </Link>
            <Link href="/items/new" className="text-brand-600 hover:underline">
              商品を登録
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="card p-0">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="text-lg font-semibold">最近の注文</h2>
            <Link href="/orders" className="text-sm text-brand-600 hover:underline">
              すべて見る →
            </Link>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>注文番号</th>
                  <th>得意先</th>
                  <th>注文日</th>
                  <th className="text-right">合計</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="font-mono">
                      <Link
                        href={`/orders/${o.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td>{o.customer.name}</td>
                    <td>{dateJP(o.orderDate)}</td>
                    <td className="text-right">{yen(o.total)}</td>
                    <td>
                      <span className={`badge ${ORDER_STATUS_BADGE[o.status]}`}>
                        {ORDER_STATUS_LABEL[o.status]}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-500 py-8">
                      注文がまだありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">在庫アラート</h2>
            <Link href="/inventory" className="text-sm text-brand-600 hover:underline">
              在庫管理 →
            </Link>
          </div>
          {lowAlerts.length === 0 ? (
            <p className="text-sm text-slate-500">アラート対象はありません</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowAlerts.slice(0, 10).map((i) => (
                <li
                  key={i.id}
                  className="py-2 flex justify-between items-center text-sm"
                >
                  <span>
                    <span className="font-mono text-slate-500 mr-2">{i.code}</span>
                    {i.name}
                  </span>
                  <span className="text-red-600 font-medium">
                    {num(i.stock)} / {num(i.reorderPoint)} {i.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">受注後仕入品の残在庫・仕入不足</h2>
            <Link href="/inventory" className="text-sm text-brand-600 hover:underline">
              在庫管理 →
            </Link>
          </div>
          <p className="text-xs text-slate-600 mb-3">
            実在庫と受注下書きの数量を比較した参考値です。下書きは在庫の引当ではありません。確定済み受注は出庫済みなので二重に差し引きません。
          </p>
          {onDemand.length === 0 ? (
            <p className="text-sm text-slate-500">残在庫・未確定受注のある受注後仕入品はありません</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {onDemand.slice(0, 10).map(item => (
                <li key={item.id} className="py-2 text-sm">
                  <Link href={`/items/${item.id}`} className="text-brand-600 font-medium">
                    {item.code} {item.name}
                  </Link>
                  <div className="text-slate-700">
                    現物 {num(item.stock)} {item.unit} ／ 受注下書き {num(item.pendingDraftUnits)} {item.unit}
                    <span className="block font-medium text-amber-800">
                      追加注文に使える見込み: {num(item.estimatedAvailable)} {item.unit}
                    </span>
                    {item.additionalUnitsNeeded > 0 && (
                      <span className="block font-medium text-red-700">
                        下書き受注に対する仕入不足: {num(item.additionalUnitsNeeded)} {item.unit}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link href={href} className="card p-5 hover:shadow-sm transition block">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Link>
  );
}
