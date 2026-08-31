import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { yen, num } from "@/lib/format";
import { deleteItem } from "./actions";
import { DeleteForm } from "@/components/DeleteForm";

export const dynamic = "force-dynamic";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: { q?: string; low?: string };
}) {
  const { tenantId } = await requireTenant();
  const q = searchParams.q?.trim() ?? "";
  const low = searchParams.low === "1";

  const items = await prisma.item.findMany({
    where: {
      tenantId,
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

  const filtered = low ? items.filter((i) => i.stock <= i.reorderPoint) : items;

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

      <form className="mb-4 flex gap-2 items-center" action="/items">
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
          発注点以下のみ
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
              <th className="text-right">在庫</th>
              <th className="text-right">発注点</th>
              <th className="text-right">仕入単価</th>
              <th className="text-right">販売単価</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => {
              const lowStock = it.stock <= it.reorderPoint;
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
                    {it.nameKana && (
                      <div className="text-xs text-slate-500">{it.nameKana}</div>
                    )}
                  </td>
                  <td>{it.supplier?.name ?? "—"}</td>
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
                  <td className="text-right">{num(it.reorderPoint)}</td>
                  <td className="text-right">{yen(it.costPrice)}</td>
                  <td className="text-right">{yen(it.salesPrice)}</td>
                  <td className="text-right">
                    <DeleteForm
                      id={it.id}
                      action={deleteItem}
                      confirm={`商品「${it.name}」を削除しますか？`}
                    />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-slate-500 py-8">
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
