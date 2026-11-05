import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP } from "@/lib/format";
import { b2bReturnFormsEnabled } from "@/lib/b2b-return-feature";
import { B2B_RETURN_STATUS_LABEL, B2B_RETURN_REASON_LABEL } from "@/lib/b2b-return-labels";
import { ReturnReviewForm } from "../ReturnReviewForm";

export const dynamic = "force-dynamic";

export default async function B2BReturnDetailPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  if (!b2bReturnFormsEnabled()) notFound();
  const { tenantId, role } = await requireTenant();
  const { id } = await params;
  const request = await prisma.b2BReturnRequest.findFirst({
    where: { id, OR: [{ buyerTenantId: tenantId }, { sellerTenantId: tenantId }] },
    include: {
      companyOrder: {
        select: { poNumber: true, purchaseOrderId: true, sellerOrderId: true },
      },
      items: { orderBy: { id: "asc" }, include: { sourceLine: true } },
    },
  });
  if (!request) notFound();
  const isBuyer = request.buyerTenantId === tenantId;
  const canReview = !isBuyer && request.sellerTenantId === tenantId &&
    (role === "OWNER" || role === "ADMIN") &&
    ["SUBMITTED", "UNDER_REVIEW"].includes(request.status);
  return (
    <>
      <PageHeader title={`返品申請 ${request.requestNumber}`}
        description={`企業間発注 ${request.companyOrder.poNumber}`}
        action={<Link href="/returns" className="btn-secondary">返品一覧へ</Link>}/>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="card p-4">
          <p className="text-xs text-slate-500">申請状況</p>
          <p className="font-semibold">{B2B_RETURN_STATUS_LABEL[request.status]}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">申請日</p>
          <p>{dateJP(request.createdAt)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">自社の立場</p>
          <p>{isBuyer ? "申請元（買い手）" : "審査側（売り手）"}</p>
        </div>
      </div>
      <div className="card table-wrap mb-5">
        <table className="tbl">
          <thead>
            <tr><th>商品（発注元側）</th><th className="text-right">申請数量</th>
              <th className="text-right">承認数量</th><th>理由</th></tr>
          </thead>
          <tbody>
            {request.items.map(line => (
              <tr key={line.id}>
                <td>{line.sourceLine.itemName}</td>
                <td className="text-right">{line.requestedQuantity} {line.sourceLine.unit}</td>
                <td className="text-right">{line.decidedAt ? line.approvedQuantity : "未審査"}</td>
                <td>{B2B_RETURN_REASON_LABEL[line.reason]}{line.note && <span className="block text-xs">{line.note}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {request.reviewNote && (
        <div className="card p-4 mb-5">
          <h2 className="font-semibold">売り手の審査コメント</h2>
          <p className="whitespace-pre-wrap text-sm">{request.reviewNote}</p>
        </div>
      )}
      {canReview && (
        <section className="card p-5 mb-5" aria-label="返品申請を審査">
          <h2 className="font-semibold text-lg mb-3">申請の審査</h2>
          <ReturnReviewForm requestId={request.id}
            lines={request.items.map(line => ({
              sourceLineId: line.sourceLineId,
              itemName: line.sourceLine.itemName,
              unit: line.sourceLine.unit,
              requestedQuantity: line.requestedQuantity,
              reason: line.reason,
              note: line.note,
            }))}/>
        </section>
      )}
      {!isBuyer && !canReview &&
       ["SUBMITTED", "UNDER_REVIEW"].includes(request.status) && (
        <p className="card p-4 mb-4 text-sm text-slate-700">
          この申請の審査には売り手企業の管理者権限が必要です。
        </p>
      )}
      <p className="text-sm text-amber-900 border border-amber-200 bg-amber-50 rounded-lg p-4">
        返品申請・承認と実際の返送・検品・クレジットノートは別工程です。
        現時点で在庫や請求・返金金額は変更されません。
      </p>
    </>
  );
}
