import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { yen, num } from "@/lib/format";

export const dynamic = "force-dynamic";

type Mode = "qty" | "sales" | "margin";

export default async function ProductReportPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; mode?: string };
}) {
  const { tenantId } = await requireTenant();
  const now = new Date();
  const year = parseInt(searchParams.year || String(now.getFullYear()), 10);
  const month = parseInt(searchParams.month || String(now.getMonth() + 1), 10);
  const mode = (["qty", "sales", "margin"].includes(searchParams.mode || "")
    ? searchParams.mode
    : "sales") as Mode;

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      status: { in: ["CONFIRMED", "SHIPPED", "COMPLETED"] },
      OR: [
        { dueDate: { gte: start, lt: end } },
        {
          AND: [{ dueDate: null }, { orderDate: { gte: start, lt: end } }],
        },
      ],
    },
    include: {
      items: { include: { item: { select: { id: true, code: true, name: true, costPrice: true } } } },
    },
  });

  type Row = {
    itemId: string | null;
    code: string;
    name: string;
    qty: number;
    sales: number;
    cost: number;
  };
  const map = new Map<string, Row>();
  for (const o of orders) {
    for (const li of o.items) {
      const key = li.item?.id || `manual::${li.itemName}`;
      const cur = map.get(key) ?? {
        itemId: li.item?.id ?? null,
        code: li.item?.code ?? "—",
        name: li.itemName,
        qty: 0,
        sales: 0,
        cost: 0,
      };
      cur.qty += li.quantity;
      cur.sales += li.amount;
      cur.cost += (li.item?.costPrice ?? 0) * li.quantity;
      map.set(key, cur);
    }
  }
  const rows = Array.from(map.values()).map((r) => ({
    ...r,
    margin: r.sales - r.cost,
    marginRate: r.sales > 0 ? Math.round(((r.sales - r.cost) / r.sales) * 1000) / 10 : 0,
  }));
  rows.sort((a, b) => {
    if (mode === "qty") return b.qty - a.qty;
    if (mode === "margin") return b.margin - a.margin;
    return b.sales - a.sales;
  });
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalMargin = rows.reduce((s, r) => s + r.margin, 0);

  return (
    <>
      <PageHeader
        title="商品別月次売上レポート"
        description="納品月で集計した商品別の販売数・売上・粗利"
      />
      <form action="/reports/products" className="card p-4 mb-4 flex gap-2 flex-wrap items-end">
        <div>
          <label className="label">年</label>
          <input type="number" name="year" defaultValue={year} className="input w-28" />
        </div>
        <div>
          <label className="label">月</label>
          <input type="number" name="month" min={1} max={12} defaultValue={month} className="input w-20" />
        </div>
        <div>
          <label className="label">並び順</label>
          <select name="mode" defaultValue={mode} className="input w-40">
            <option value="sales">売上額</option>
            <option value="qty">受注数</option>
            <option value="margin">粗利</option>
          </select>
        </div>
        <button className="btn-primary">表示</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="card p-4">
          <div className="text-xs text-slate-500">総数量</div>
          <div className="text-xl font-bold">{num(totalQty)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">総売上</div>
          <div className="text-xl font-bold">{yen(totalSales)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">総粗利</div>
          <div className="text-xl font-bold">{yen(totalMargin)}</div>
        </div>
      </div>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>コード</th>
              <th>商品名</th>
              <th className="text-right">数量</th>
              <th className="text-right">売上</th>
              <th className="text-right">原価</th>
              <th className="text-right">粗利</th>
              <th className="text-right">粗利率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.code}-${r.name}`}>
                <td className="font-mono">{r.code}</td>
                <td>{r.name}</td>
                <td className="text-right">{num(r.qty)}</td>
                <td className="text-right">{yen(r.sales)}</td>
                <td className="text-right">{yen(r.cost)}</td>
                <td className="text-right font-medium">{yen(r.margin)}</td>
                <td className="text-right">{r.marginRate}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-500 py-8">
                  対象月の販売実績がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
