import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen, num } from "@/lib/format";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_BADGE } from "../page";
import { InvoiceStatusActions } from "./InvoiceStatusActions";

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const { tenantId } = await requireTenant();
  const inv = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId },
    include: {
      customer: true,
      businessUnit: true,
      orders: {
        include: {
          order: {
            include: { items: { include: { item: true } } },
          },
        },
      },
    },
  });
  if (!inv) notFound();

  return (
    <>
      <PageHeader
        title={`請求 ${inv.invoiceNumber}`}
        action={
          <div className="flex items-center gap-3">
            <Link href={`/print/invoices/${inv.id}`} target="_blank" className="btn-secondary">
              請求書を印刷
            </Link>
            <span className={`badge ${INVOICE_STATUS_BADGE[inv.status]} text-sm`}>
              {INVOICE_STATUS_LABEL[inv.status]}
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs text-slate-500">得意先</div>
          <div className="font-medium">{inv.customer.name}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">請求月</div>
          <div className="font-medium">{inv.periodYear}年{inv.periodMonth}月</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">伝票数</div>
          <div className="font-medium">{inv.orders.length}件</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">合計</div>
          <div className="text-xl font-bold">{yen(inv.total)}</div>
        </div>
      </div>

      <div className="card table-wrap mb-6">
        <table className="tbl">
          <thead>
            <tr>
              <th>注文番号</th>
              <th>納品日</th>
              <th className="text-right">小計</th>
              <th className="text-right">消費税</th>
              <th className="text-right">合計</th>
            </tr>
          </thead>
          <tbody>
            {inv.orders.map((io) => (
              <tr key={io.orderId}>
                <td className="font-mono">
                  <Link href={`/orders/${io.order.id}`} className="text-brand-600 hover:underline">
                    {io.order.orderNumber}
                  </Link>
                </td>
                <td>{dateJP(io.order.dueDate || io.order.orderDate)}</td>
                <td className="text-right">{yen(io.order.subtotal)}</td>
                <td className="text-right">{yen(io.order.tax)}</td>
                <td className="text-right font-medium">{yen(io.order.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="text-right font-medium">小計</td>
              <td className="text-right">{yen(inv.subtotal)}</td>
              <td className="text-right">{yen(inv.tax)}</td>
              <td className="text-right font-bold">{yen(inv.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <InvoiceStatusActions id={inv.id} status={inv.status} />
    </>
  );
}
