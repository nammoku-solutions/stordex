import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen, num } from "@/lib/format";
import {
  QUOTATION_STATUS_LABEL,
  QUOTATION_STATUS_BADGE,
} from "../_status";
import { QuotationStatusActions } from "./QuotationStatusActions";

export default async function QuotationDetailPage({ params }: { params: { id: string } }) {
  const { tenantId } = await requireTenant();
  const q = await prisma.quotation.findFirst({
    where: { id: params.id, tenantId },
    include: { customer: true, items: true },
  });
  if (!q) notFound();

  return (
    <>
      <PageHeader
        title={`見積 ${q.quotationNumber}`}
        action={
          <div className="flex items-center gap-3">
            <Link href={`/print/quotations/${q.id}`} target="_blank" className="btn-secondary">
              印刷 / PDF
            </Link>
            <span className={`badge ${QUOTATION_STATUS_BADGE[q.status]} text-sm`}>
              {QUOTATION_STATUS_LABEL[q.status]}
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs text-slate-500">得意先</div>
          <div className="font-medium">{q.customer.name}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">発行日 / 有効期限</div>
          <div className="font-medium">{dateJP(q.issueDate)}</div>
          <div className="text-xs text-slate-500">期限: {dateJP(q.validUntil)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">合計</div>
          <div className="text-xl font-bold">{yen(q.total)}</div>
        </div>
      </div>

      <div className="card table-wrap mb-6">
        <table className="tbl">
          <thead>
            <tr>
              <th>商品名 / 規格</th>
              <th className="text-right">数量</th>
              <th className="text-right">単価</th>
              <th className="text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.itemName}
                  {l.spec && <div className="text-xs text-slate-500">{l.spec}</div>}
                </td>
                <td className="text-right">{num(l.quantity)} {l.unit}</td>
                <td className="text-right">{yen(l.unitPrice)}</td>
                <td className="text-right font-medium">{yen(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <QuotationStatusActions id={q.id} status={q.status} />
    </>
  );
}
