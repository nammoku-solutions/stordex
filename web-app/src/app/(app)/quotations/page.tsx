import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き",
  SENT: "送付済",
  ACCEPTED: "受諾",
  REJECTED: "却下",
  EXPIRED: "期限切れ",
};
const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  EXPIRED: "bg-amber-100 text-amber-800",
};

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const { tenantId } = await requireTenant();
  const q = searchParams.q?.trim() ?? "";
  const quotations = await prisma.quotation.findMany({
    where: {
      tenantId,
      ...(q
        ? {
            OR: [
              { quotationNumber: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { customer: true, items: { select: { id: true } } },
    orderBy: { issueDate: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="見積書"
        description="顧客向けの見積書を作成・管理します"
        action={
          <Link href="/quotations/new" className="btn-primary">
            ＋ 新規見積
          </Link>
        }
      />
      <form className="mb-4 flex gap-2" action="/quotations">
        <input name="q" defaultValue={q} className="input max-w-sm" placeholder="番号・得意先で検索" />
        <button className="btn-secondary">検索</button>
      </form>
      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>見積番号</th>
              <th>発行日</th>
              <th>得意先</th>
              <th className="text-right">明細</th>
              <th className="text-right">合計</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map((q) => (
              <tr key={q.id}>
                <td className="font-mono">
                  <Link href={`/quotations/${q.id}`} className="text-brand-600 hover:underline">
                    {q.quotationNumber}
                  </Link>
                </td>
                <td>{dateJP(q.issueDate)}</td>
                <td>{q.customer.name}</td>
                <td className="text-right">{q.items.length}</td>
                <td className="text-right font-medium">{yen(q.total)}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[q.status]}`}>{STATUS_LABEL[q.status]}</span>
                </td>
              </tr>
            ))}
            {quotations.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-8">
                  見積書がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export { STATUS_LABEL as QUOTATION_STATUS_LABEL, STATUS_BADGE as QUOTATION_STATUS_BADGE };
