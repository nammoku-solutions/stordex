import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { yen, num } from "@/lib/format";
import { deleteItem, reactivateItem } from "./actions";
import { DeleteForm } from "@/components/DeleteForm";
import { belowMinimumStock } from "@/lib/inventory-policy";
import { getItemRemovalNotice } from "@/lib/item-removal-notice";

export const dynamic = "force-dynamic";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; low?: string; inactive?: string; removal?: string }>;
}) {
  const { tenantId } = await requireTenant();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const low = params.low === "1";
  const includeInactive = params.inactive === "1";
  const removalNotice = getItemRemovalNotice(params.removal);

  const items = await prisma.item.findMany({
    where: {
      tenantId,
      ...(includeInactive ? {} : { active: true }),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { nameKana: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { supplier: true },
    orderBy: [{ active: "desc" }, { code: "asc" }],
    take: 300,
  });

  const alerted = new Set(belowMinimumStock(items.filter(item => item.active)).map(item => item.id));
  const filtered = low ? items.filter(item => alerted.has(item.id)) : items;

  return (
    <>
      <PageHeader
        title="商品マスタ"
        description="取扱商品の登録・在庫数・価格を管理します"
        action={
          <Link href="/items/new" className="btn-primary">
            ＋ 新規登録
          </Link>
        }
      />

      {removalNotice && (
        <div
          role={removalNotice.tone === "error" ? "alert" : "status"}
          aria-live={removalNotice.tone === "error" ? "assertive" : "polite"}
          className={`mb-5 rounded-lg border p-4 shadow-sm ${
            removalNotice.tone === "error"
              ? "border-red-300 bg-red-50 text-red-900"
              : removalNotice.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                removalNotice.tone === "error" ? "border-red-700" : "border-current"
              }`}
            >
              {removalNotice.tone === "error" ? "!" : "✓"}
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{removalNotice.title}</p>
              <p className="mt-1 text-sm leading-relaxed">{removalNotice.message}</p>
              {removalNotice.links && (
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  {removalNotice.links.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="text-sm font-semibold underline underline-offset-2 hover:no-underline"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <form className="mb-4 flex flex-wrap gap-3 items-center" action="/items">
        <input
          name="q"
          defaultValue={q}
          className="input max-w-sm"
          placeholder="コード・名称で検索"
        />
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="low"
            value="1"
            defaultChecked={low}
            className="rounded-sm border-slate-300"
          />
          最低在庫割れの常備品のみ
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="inactive" value="1" defaultChecked={includeInactive}
            className="rounded-sm border-slate-300" />
          取扱停止商品を表示
        </label>
        <button className="btn-secondary">適用</button>
      </form>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>コード</th>
              <th>商品名</th>
              <th>仕入先</th>
              <th>商品区分</th>
              <th>仕入荷姿</th>
              <th className="text-right">在庫</th>
              <th className="text-right">最低在庫</th>
              <th className="text-right">仕入単価</th>
              <th className="text-right">販売単価</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => {
              const lowStock = alerted.has(it.id);
              return (
                <tr key={it.id}>
                  <td className="font-mono">{it.code}</td>
                  <td>
                    <Link
                      href={`/items/${it.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {it.name}
                    </Link>
                    {!it.active && (
                      <span className="ml-2 text-xs font-semibold text-amber-800">取扱停止</span>
                    )}
                    {it.nameKana && (
                      <div className="text-xs text-slate-500">{it.nameKana}</div>
                    )}
                  </td>
                  <td>{it.supplier?.name ?? "—"}</td>
                  <td>{it.stockPolicy === "STOCKED" ? "常備在庫品" : "受注後仕入品"}</td>
                  <td className="text-sm">
                    {it.purchaseMode === "PACK" && it.caseQty
                      ? `1${it.orderUnit || "パック"} = ${num(it.caseQty)} ${it.unit}`
                      : "個別単位"}
                  </td>
                  <td className="text-right">
                    <span
                      className={
                        lowStock
                          ? "badge bg-red-100 text-red-700"
                          : "badge bg-emerald-100 text-emerald-700"
                      }
                    >
                      {num(it.stock)} {it.unit}
                    </span>
                  </td>
                  <td className="text-right">{it.stockPolicy === "STOCKED" && it.reorderPoint > 0 ? num(it.reorderPoint) : "—"}</td>
                  <td className="text-right">{yen(it.costPrice)}</td>
                  <td className="text-right">{yen(it.salesPrice)}</td>
                  <td className="text-right">
                    {!it.active ? (
                      <form action={reactivateItem.bind(null, it.id)}>
                        <button type="submit" className="text-brand-600 hover:underline text-sm">
                          取扱再開
                        </button>
                      </form>
                    ) : it.stock !== 0 ? (
                      <span className="text-xs text-amber-800" title="在庫管理で現在庫を確認してください">
                        在庫あり・削除不可
                      </span>
                    ) : (
                      <DeleteForm
                        id={it.id}
                        action={deleteItem}
                        confirm={`商品「${it.name}」を削除しますか？ 過去履歴がある場合は取扱停止になります。進行中の取引がある場合は削除できません。`}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-slate-500 py-8">
                  該当する商品がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
