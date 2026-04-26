import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen, ORDER_STATUS_LABEL, ORDER_STATUS_BADGE } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; range?: string };
}) {
  const { tenantId } = await requireTenant();
  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status?.trim() ?? "";
  const range = searchParams.range?.trim() ?? "";

  // 日付クイックフィルタ（旧アプリの「本日納品」「翌日納品」「本日受注」相当）
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let dateWhere: any = {};
  if (range === "today-due") {
    dateWhere = { dueDate: { gte: startOfDay(now), lte: endOfDay(now) } };
  } else if (range === "tomorrow-due") {
    dateWhere = { dueDate: { gte: startOfDay(tomorrow), lte: endOfDay(tomorrow) } };
  } else if (range === "today-order") {
    dateWhere = { orderDate: { gte: startOfDay(now), lte: endOfDay(now) } };
  }

  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      ...(status ? { status: status as any } : {}),
      ...dateWhere,
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
              { customer: { code: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { customer: true, items: { select: { id: true } } },
    orderBy: { orderDate: "desc" },
    take: 200,
  });

  const ranges = [
    { v: "", label: "すべて" },
    { v: "today-order", label: "本日受注" },
    { v: "today-due", label: "本日納品" },
    { v: "tomorrow-due", label: "翌日納品" },
  ];

  return (
    <>
      <PageHeader
        title="受注管理"
        description="得意先からの注文を作成・管理します"
        action={
          <Link href="/orders/new" className="btn-primary">
            ＋ 新規注文
          </Link>
        }
      />

      <form className="mb-4 flex gap-2 items-center flex-wrap" action="/orders">
        <input
          name="q"
          defaultValue={q}
          className="input max-w-sm"
          placeholder="注文番号・得意先で検索"
        />
        <select name="status" defaultValue={status} className="input max-w-xs">
          <option value="">すべての状態</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="range" defaultValue={range} className="input max-w-xs">
          {ranges.map((r) => (
            <option key={r.v} value={r.v}>
              {r.label}
            </option>
          ))}
        </select>
        <button className="btn-secondary">検索</button>
      </form>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>注文番号</th>
              <th>注文日</th>
              <th>得意先</th>
              <th className="text-right">明細</th>
              <th className="text-right">合計</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="font-mono">
                  <Link href={`/orders/${o.id}`} className="text-brand-600 hover:underline">
                    {o.orderNumber}
                  </Link>
                </td>
                <td>{dateJP(o.orderDate)}</td>
                <td>
                  {o.customer.name}
                  <div className="text-xs text-slate-500 font-mono">{o.customer.code}</div>
                </td>
                <td className="text-right">{o.items.length}</td>
                <td className="text-right font-medium">{yen(o.total)}</td>
                <td>
                  <span className={`badge ${ORDER_STATUS_BADGE[o.status]}`}>
                    {ORDER_STATUS_LABEL[o.status]}
                  </span>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-8">
                  注文がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
