import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function BusinessUnitsPage() {
  const { tenantId } = await requireTenant();
  const units = await prisma.businessUnit.findMany({
    where: { tenantId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return (
    <>
      <PageHeader
        title="事業所設定"
        description="複数事業所での請求発行に対応します（旧アプリの会社1/会社2切替）"
        action={
          <Link href="/settings/business-units/new" className="btn-primary">
            ＋ 事業所追加
          </Link>
        }
      />
      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>事業所名</th>
              <th>住所</th>
              <th>TEL</th>
              <th>FAX</th>
              <th>既定</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link href={`/settings/business-units/${u.id}`} className="text-brand-600 hover:underline">
                    {u.name}
                  </Link>
                </td>
                <td>{u.address || "—"}</td>
                <td>{u.phone || "—"}</td>
                <td>{u.fax || "—"}</td>
                <td>{u.isDefault ? "✓" : ""}</td>
              </tr>
            ))}
            {units.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-slate-500 py-8">
                  事業所が登録されていません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
