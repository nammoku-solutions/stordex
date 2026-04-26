import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { deleteSupplier } from "./actions";
import { DeleteForm } from "@/components/DeleteForm";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const { tenantId } = await requireTenant();
  const q = searchParams.q?.trim() ?? "";

  const suppliers = await prisma.supplier.findMany({
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
        title="仕入先"
        description="仕入元（商品の供給元）の一覧と管理"
        action={
          <Link href="/suppliers/new" className="btn-primary">
            ＋ 新規登録
          </Link>
        }
      />

      <form className="mb-4 flex gap-2" action="/suppliers">
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td className="font-mono">{s.code}</td>
                <td>
                  <Link href={`/suppliers/${s.id}`} className="text-brand-600 hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td>{s.contact || "—"}</td>
                <td>{s.phone || "—"}</td>
                <td className="max-w-xs truncate">{s.address || "—"}</td>
                <td className="text-right">
                  <DeleteForm
                    id={s.id}
                    action={deleteSupplier}
                    confirm={`仕入先「${s.name}」を削除しますか？`}
                  />
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-8">
                  仕入先が登録されていません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
