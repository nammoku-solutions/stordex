import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateTimeJP, num, MOVEMENT_TYPE_LABEL } from "@/lib/format";
import { MovementForm } from "./MovementForm";
import { belowMinimumStock, onDemandRemaining } from "@/lib/inventory-policy";

export const dynamic = "force-dynamic";

const TYPE_BADGE: Record<string, string> = {
  INBOUND: "bg-emerald-100 text-emerald-700",
  OUTBOUND: "bg-amber-100 text-amber-800",
  ADJUSTMENT: "bg-slate-200 text-slate-700",
};

export default async function InventoryPage() {
  const { tenantId } = await requireTenant();
  const [items, lowStock, movements] = await Promise.all([
    prisma.item.findMany({
      where: { tenantId, active: true },
      select: { id: true, code: true, name: true, unit: true, stock: true },
      orderBy: { code: "asc" },
    }),
    prisma.item.findMany({
      where: { tenantId, active: true, stockPolicy: "STOCKED", reorderPoint: { gt: 0 } },
      orderBy: { code: "asc" },
    }),
    prisma.inventoryMovement.findMany({
      where: { tenantId },
      include: { item: { select: { code: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const lowAlerts = belowMinimumStock(lowStock);
  const pendingItems = await prisma.item.findMany({
    where: { tenantId, active: true, stockPolicy: "ON_DEMAND" },
    orderBy: { code: "asc" },
  });
  const pendingOrders = pendingItems.length ? await prisma.orderItem.groupBy({
    by: ["itemId"],
    where: {
      itemId: { in: pendingItems.map(item => item.id) },
      order: { tenantId, status: "DRAFT" },
    },
    _sum: { quantity: true },
  }) : [];
  const leftover = onDemandRemaining(pendingItems,
    new Map(pendingOrders.map(line => [line.itemId, line._sum.quantity ?? 0])));

  return (
    <>
      <PageHeader
        title="在庫管理"
        description="入出庫の記録、在庫アラート、移動履歴"
        action={<Link href="/inventory/history" className="btn-primary">過去の在庫を照会</Link>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">入出庫を記録</h2>
            <MovementForm items={items} />
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">
              常備在庫品の最低在庫割れ
            </h2>
            {lowAlerts.length === 0 ? (
              <p className="text-sm text-slate-500">アラート対象はありません</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lowAlerts.map((i) => (
                  <li key={i.id} className="py-2 flex justify-between text-sm">
                    <span>
                      <span className="font-mono text-slate-500 mr-2">{i.code}</span>
                      {i.name}
                    </span>
                    <span className="text-red-600 font-medium">
                      {num(i.stock)} / 発注点 {num(i.reorderPoint)} {i.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-3">受注後仕入品の残在庫・仕入不足</h2>
            <p className="text-xs text-slate-600 mb-3">
              現物在庫と未確定受注下書きの数量を比較します。利用可能見込み・仕入不足は参考値であり、
              下書きは在庫の引当を保証しません。
            </p>
            {leftover.length === 0 ? (
              <p className="text-sm text-slate-500">残在庫・未確定受注のある受注後仕入品はありません</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {leftover.map(item => (
                  <li key={item.id} className="py-2 text-sm">
                    <Link href={`/items/${item.id}`} className="text-brand-600 font-medium">
                      {item.code} {item.name}
                    </Link>
                    <p>現物 {num(item.stock)} {item.unit} ／ 下書き受注 {num(item.pendingDraftUnits)} {item.unit}</p>
                    <p className="font-medium text-amber-800">
                      次の注文に利用できる見込み: {num(item.estimatedAvailable)} {item.unit}
                    </p>
                    {item.additionalUnitsNeeded > 0 && (
                      <p className="font-medium text-red-700">
                        下書き受注に対する仕入不足: {num(item.additionalUnitsNeeded)} {item.unit}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card p-0">
          <h2 className="text-lg font-semibold p-6 pb-3">移動履歴（直近50件）</h2>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>区分</th>
                  <th>商品</th>
                  <th className="text-right">数量</th>
                  <th className="text-right">残在庫</th>
                  <th>参照</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="text-xs">{dateTimeJP(m.createdAt)}</td>
                    <td>
                      <span className={`badge ${TYPE_BADGE[m.type]}`}>
                        {MOVEMENT_TYPE_LABEL[m.type]}
                      </span>
                    </td>
                    <td>
                      <div className="text-xs font-mono text-slate-500">
                        {m.item.code}
                      </div>
                      {m.item.name}
                    </td>
                    <td className="text-right">
                      {m.type === "OUTBOUND" ? "-" : "+"}
                      {num(Math.abs(m.quantity))}
                    </td>
                    <td className="text-right">{num(m.balance)}</td>
                    <td className="text-xs text-slate-500">{m.reference || "—"}</td>
                  </tr>
                ))}
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-500 py-8">
                      履歴がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
