import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { deleteCustomer } from "./actions";
import { DeleteForm } from "@/components/DeleteForm";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const { tenantId } = await requireTenant();
  const q = searchParams.q?.trim() ?? "";

  const customers = await prisma.customer.findMany({
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
    orderBy: [{ active: "desc" }, { code: "asc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="得意先"
        description="販売先（注文を受ける相手）の一覧と管理"
        action={
          <Link href="/customers/new" className="btn-primary">
            ＋ 新規登録
          </Link>
        }
      />

      <form className="mb-4 flex gap-2" action="/customers">
        <input
          name="q"
          defaultValue={q}
          className="input max-w-sm"
          placeholder="コード・名称で検索"
        />
        <button className="btn-secondary">検索</button>
      </form>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>コード</th>
              <th>名称</th>
              <th>担当者</th>
              <th>電話</th>
              <th>住所</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td className="font-mono">{c.code}</td>
                <td>
                  <Link href={`/customers/${c.id}`} className="text-brand-600 hover:underline">
                    {c.name}
                  </Link>
                  {c.nameKana && (
                    <div className="text-xs text-slate-500">{c.nameKana}</div>
                  )}
                </td>
                <td>{c.contact || "—"}</td>
                <td>{c.phone || "—"}</td>
                <td className="max-w-xs truncate">{c.address || "—"}</td>
                <td>
                  <span
                    className={
                      c.active
                        ? "badge bg-emerald-100 text-emerald-700"
                        : "badge bg-slate-200 text-slate-600"
                    }
                  >
                    {c.active ? "有効" : "停止"}
                  </span>
                </td>
                <td className="text-right">
                  <DeleteForm
                    id={c.id}
                    action={deleteCustomer}
                    confirm={`得意先「${c.name}」を削除しますか？`}
                  />
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-500 py-8">
                  得意先が登録されていません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
