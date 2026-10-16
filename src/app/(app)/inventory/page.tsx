import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateTimeJP, num, MOVEMENT_TYPE_LABEL } from "@/lib/format";
import { MovementForm } from "./MovementForm";

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
      where: { tenantId, active: true },
      orderBy: { code: "asc" },
      take: 200,
    }),
    prisma.inventoryMovement.findMany({
      where: { tenantId },
      include: { item: { select: { code: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const lowAlerts = lowStock.filter((i) => i.stock <= i.reorderPoint);

  return (
    <>
      <PageHeader
        title="在庫管理"
        description="入出庫の記録、在庫アラート、移動履歴"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">入出庫を記録</h2>
            <MovementForm items={items} />
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">
              在庫アラート（発注点以下）
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
