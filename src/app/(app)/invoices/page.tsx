import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き",
  ISSUED: "発行済",
  PAID: "入金済",
  CANCELLED: "無効",
};
const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ISSUED: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function InvoicesPage() {
  const { tenantId } = await requireTenant();
  const invoices = await prisma.invoice.findMany({
    where: { tenantId },
    include: { customer: true, orders: { select: { orderId: true } } },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return (
    <>
      <PageHeader
        title="請求書"
        description="月次の集計請求書を作成します"
        action={
          <Link href="/invoices/new" className="btn-primary">
            ＋ 新規請求書
          </Link>
        }
      />
      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>請求番号</th>
              <th>請求月</th>
              <th>得意先</th>
              <th className="text-right">伝票数</th>
              <th className="text-right">合計</th>
              <th>発行日</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td className="font-mono">
                  <Link href={`/invoices/${i.id}`} className="text-brand-600 hover:underline">
                    {i.invoiceNumber}
                  </Link>
                </td>
                <td>{i.periodYear}年{i.periodMonth}月</td>
                <td>{i.customer.name}</td>
                <td className="text-right">{i.orders.length}</td>
                <td className="text-right font-medium">{yen(i.total)}</td>
                <td>{dateJP(i.issueDate)}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[i.status]}`}>{STATUS_LABEL[i.status]}</span>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-500 py-8">
                  請求書がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export { STATUS_LABEL as INVOICE_STATUS_LABEL, STATUS_BADGE as INVOICE_STATUS_BADGE };
