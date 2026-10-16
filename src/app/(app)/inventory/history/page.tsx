import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { num } from "@/lib/format";
import {
  jstStartOfDate,
  nextJstDate,
  summarizeInventory,
  todayInJapan,
  type MovementSum,
} from "@/lib/inventory-history";

export const dynamic = "force-dynamic";

type Params = {
  mode?: string;
  asOf?: string;
  from?: string;
  to?: string;
};

export default async function InventoryHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const { tenantId } = await requireTenant();
  const params = await searchParams;
  const today = todayInJapan();
  const mode = params.mode === "range" ? "range" : "asof";
  const asOf = params.asOf ?? today;
  const from = params.from ?? today;
  const to = params.to ?? today;

  const endDate = jstStartOfDate(mode === "asof" ? asOf : to);
  const startDate = mode === "range" ? jstStartOfDate(from) : null;
  let error: string | null = null;
  if (!endDate || (mode === "range" && !startDate)) {
    error = "日付を正しく入力してください。";
  } else if ((mode === "asof" ? asOf : to) > today) {
    error = "未来の日付は指定できません。";
  } else if (startDate && startDate > endDate) {
    error = "開始日は終了日以前を指定してください。";
  }

  const rows = [];
  if (!error && endDate) {
    // Treat selected dates as Japanese calendar dates, end-inclusive.
    const endExclusive = new Date(Math.min(nextJstDate(endDate).getTime(), Date.now()));
    const [items, afterCutoff, inPeriod] = await Promise.all([
      prisma.item.findMany({
        where: { tenantId },
        select: { id: true, code: true, name: true, unit: true, stock: true, createdAt: true },
        orderBy: { code: "asc" },
      }),
      prisma.inventoryMovement.groupBy({
        by: ["itemId", "type"],
        where: { tenantId, createdAt: { gte: endExclusive } },
        _sum: { quantity: true },
      }),
      startDate
        ? prisma.inventoryMovement.groupBy({
            by: ["itemId", "type"],
            where: { tenantId, createdAt: { gte: startDate, lt: endExclusive } },
            _sum: { quantity: true },
          })
        : Promise.resolve([] as MovementSum[]),
    ]);
    rows.push(...summarizeInventory(items, afterCutoff, inPeriod, endExclusive, startDate ?? undefined));
  }

  return (
    <>
      <PageHeader
        title="在庫履歴・時点照会"
        description="指定日の終了時点、または指定期間の入出庫と残在庫を確認します（日本時間）"
        action={<Link href="/inventory" className="btn-secondary">在庫管理に戻る</Link>}
      />
      <form action="/inventory/history" className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">照会方法</label>
          <select name="mode" defaultValue={mode} className="input">
            <option value="asof">指定日終了時点</option>
            <option value="range">期間内の在庫推移</option>
          </select>
        </div>
        <div>
          <label className="label">基準日（指定日）</label>
          <input type="date" name="asOf" defaultValue={asOf} max={today} className="input" />
        </div>
        <div>
          <label className="label">開始日（期間）</label>
          <input type="date" name="from" defaultValue={from} max={today} className="input" />
        </div>
        <div>
          <label className="label">終了日（期間）</label>
          <input type="date" name="to" defaultValue={to} max={today} className="input" />
        </div>
        <button className="btn-primary">照会する</button>
      </form>
      {error ? (
        <div className="card p-5 text-red-700" role="alert">{error}</div>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {mode === "asof"
              ? asOf + " の終了時点の在庫（当日の場合は現時点）"
              : from + " ～ " + to + " の入出庫"}
          </p>
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>商品コード</th>
                  <th>商品名</th>
                  {mode === "range" && <th className="text-right">開始残</th>}
                  {mode === "range" && <th className="text-right">入庫</th>}
                  {mode === "range" && <th className="text-right">出庫</th>}
                  {mode === "range" && <th className="text-right">調整増減</th>}
                  <th className="text-right">{mode === "range" ? "終了残" : "時点在庫"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono">{row.code}</td>
                    <td>{row.name}</td>
                    {mode === "range" && (
                      <td className="text-right">
                        {row.opening === null ? "—（期間内登録）" : num(row.opening)}
                      </td>
                    )}
                    {mode === "range" && <td className="text-right">{num(row.inbound)}</td>}
                    {mode === "range" && <td className="text-right">{num(row.outbound)}</td>}
                    {mode === "range" && <td className="text-right">{num(row.adjustment)}</td>}
                    <td className="text-right font-semibold">{num(row.closing)} {row.unit}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={mode === "range" ? 7 : 3} className="p-6 text-center">
                    対象の商品がありません
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-amber-800">
            注意：この照会は現在庫と入出庫履歴からの逆算です。移行前・商品削除後・
            履歴を残さない直接在庫更新の結果は正確に復元できません。
            期間内に追加された商品は開始残を「—」と表示します。
            在庫移動のない初期登録数量は期間内入庫には含めません。
          </p>
        </>
      )}
    </>
  );
}
