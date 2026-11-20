import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { belowMinimumStock, onDemandRemaining } from "@/lib/inventory-policy";
import { AWAITING_RECEIPT_STATUS, dailyWorkLinks, INBOUND_REVIEW_STATUS } from "@/lib/daily-work";
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
    stockOnDemand,
    inboundPending,
    awaitingReceipt,
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
    prisma.item.findMany({
      where: { tenantId, active: true, stockPolicy: "ON_DEMAND" },
      orderBy: { code: "asc" },
    }),
    prisma.intercompanyOrder.count({
      where: { sellerTenantId: tenantId, status: INBOUND_REVIEW_STATUS },
    }),
    prisma.purchaseOrder.count({
      where: { tenantId, status: AWAITING_RECEIPT_STATUS },
    }),
  ]);

  const lowAlerts = belowMinimumStock(lowItems);
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
        title="ダッシュボード"
        description={session.user.tenantName}
      />

      <section className="mb-8" aria-labelledby="daily-work-title">
        <h2 id="daily-work-title" className="mb-3 text-lg font-semibold">よく使う操作</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <DailyWorkLink
            href={dailyWorkLinks.pendingInbound}
            title="届いた注文を確認"
            detail={inboundPending ? `確認待ち ${num(inboundPending)} 件` : "確認待ちの注文はありません"}
          />
          <DailyWorkLink
            href={dailyWorkLinks.awaitingReceipt}
            title="入荷待ちの発注を見る"
            detail={awaitingReceipt ? `発注済み・未入荷 ${num(awaitingReceipt)} 件` : "入荷待ちの発注はありません"}
          />
          <DailyWorkLink
            href={dailyWorkLinks.lowStock}
            title="不足している在庫を見る"
            detail={lowAlerts.length ? `最低在庫を下回った常備品 ${num(lowAlerts.length)} 品目` : "最低在庫を下回った常備品はありません"}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/orders/new" className="btn-secondary min-h-11">受注を手入力</Link>
          <Link href="/inventory" className="btn-secondary min-h-11">入出庫を記録</Link>
          <Link href="/items/new" className="btn-secondary min-h-11">商品を登録</Link>
        </div>
      </section>

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
            <h2 className="text-lg font-semibold">最低在庫を下回った常備品</h2>
            <Link href={dailyWorkLinks.lowStock} className="text-sm text-brand-600 hover:underline">
              一覧を見る →
            </Link>
          </div>
          {lowAlerts.length === 0 ? (
            <p className="text-sm text-slate-500">最低在庫を下回った常備品はありません</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowAlerts.slice(0, 10).map((i) => (
                <li
                  key={i.id}
                  className="flex items-baseline justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    <span className="font-mono text-slate-500 mr-2">{i.code}</span>
                    {i.name}
                  </span>
                  <span className="text-right font-medium text-red-700">
                    現在 {num(i.stock)} {i.unit} ／ 最低 {num(i.reorderPoint)} {i.unit}
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
            追加注文に回せる在庫がある見込みの商品は {num(spareSkuCount)} 品目です。
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
      <details className="card mt-6">
        <summary className="cursor-pointer rounded-lg px-5 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-brand-600">
          売上・登録件数
        </summary>
        <div className="grid grid-cols-2 gap-3 p-5 pt-0 lg:grid-cols-3">
          <Stat label="進行中の注文" value={num(openOrders)} href="/orders" />
          <Stat label="得意先" value={num(customerCount)} href="/customers" />
          <Stat label="商品" value={num(itemCount)} href="/items" />
          <Stat label="仕入先" value={num(supplierCount)} href="/suppliers" />
          <div className="card p-5">
            <div className="text-xs text-slate-600">今月の売上（税込）</div>
            <div className="mt-1 break-words text-xl font-bold">{yen(monthAgg._sum.total ?? 0)}</div>
            <div className="mt-1 text-xs text-slate-600">{num(monthAgg._count._all)} 件の注文</div>
          </div>
        </div>
      </details>
    </>
  );
}

function DailyWorkLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link
      href={href}
      className="card flex min-h-22 items-center justify-between gap-2 p-4 hover:border-brand-600 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <span>
        <span className="block font-semibold text-brand-700">{title}</span>
        <span className="mt-1 block text-sm text-slate-700">{detail}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-lg text-brand-700">→</span>
    </Link>
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
