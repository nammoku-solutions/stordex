import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP } from "@/lib/format";
import { b2bReturnFormsEnabled } from "@/lib/b2b-return-feature";
import { b2bReturnStockEnabled } from "@/lib/b2b-return-stock-feature";
import { assessB2BReturnProgress } from "@/lib/b2b-return-progress";
import { B2B_RETURN_STATUS_LABEL, B2B_RETURN_REASON_LABEL } from "@/lib/b2b-return-labels";
import { ReturnReviewForm } from "../ReturnReviewForm";
import { BuyerReturnDispatchForm, SellerReturnInspectionForm } from "../ReturnStockForms";

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
      items: { orderBy: { id: "asc" }, include: {
        sourceLine: true,
        stockEvents: { orderBy: { createdAt: "asc" } },
      } },
    },
  });
  if (!request) notFound();
  const isBuyer = request.buyerTenantId === tenantId;
  const manager = role === "OWNER" || role === "ADMIN";
  const stockEnabled = b2bReturnStockEnabled();
  const stockPostable = [
    "APPROVED", "PARTIALLY_APPROVED", "DISPATCHED", "PARTIALLY_INSPECTED",
  ].includes(request.status);
  const lines = request.items.map(line => {
    const dispatched = line.stockEvents
      .filter(event => event.phase === "DISPATCH")
      .reduce((total, event) => total + event.quantity, 0);
    const inspected = line.stockEvents
      .filter(event => event.phase === "INSPECTION")
      .reduce((total, event) => total + event.quantity, 0);
    const saleable = line.stockEvents
      .filter(event => event.phase === "INSPECTION")
      .reduce((total, event) => total + event.saleable, 0);
    const unsaleable = line.stockEvents
      .filter(event => event.phase === "INSPECTION")
      .reduce((total, event) => total + event.unsaleable, 0);
    return { line, dispatched, inspected, saleable, unsaleable };
  });
  // Observational progress only: formal approval status is NOT modified by
  // stock posting; that needs a distinct audited status-event release.
  const progress = assessB2BReturnProgress({
    status: request.status,
    lines: lines.map(({ line, dispatched, inspected }) => ({
      id: line.id,
      requested: line.requestedQuantity,
      approved: line.approvedQuantity,
      dispatched,
      inspected,
      draftCreditAllocated: 0,
    })),
  });
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
      <section className="card p-5 mb-5" aria-label="返送・検品の進捗">
        <h2 className="font-semibold text-lg mb-3">現物返送・検品の進捗（実績）</h2>
        <p className="text-xs text-slate-600 mb-3">
          審査結果とは別に、記録済みの入出庫・検品イベントから集計しています。
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div><p className="text-xs text-slate-500">承認数量</p><p className="font-semibold">{progress.summary.approved}</p></div>
          <div><p className="text-xs text-slate-500">返送済み</p><p className="font-semibold">{progress.summary.dispatched}</p></div>
          <div><p className="text-xs text-slate-500">検品済み</p><p className="font-semibold">{progress.summary.inspected}</p></div>
          <div><p className="text-xs text-slate-500">輸送・未検品</p><p className="font-semibold">{progress.summary.inTransit}</p></div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>商品</th><th className="text-right">承認</th>
              <th className="text-right">返送済</th><th className="text-right">検品済</th>
              <th className="text-right">良品入庫</th><th className="text-right">不良品記録</th>
            </tr></thead>
            <tbody>
              {lines.map(({ line, dispatched, inspected, saleable, unsaleable }) => (
                <tr key={line.id}>
                  <td>{line.sourceLine.itemName}</td>
                  <td className="text-right">{line.approvedQuantity}</td>
                  <td className="text-right">{dispatched}</td>
                  <td className="text-right">{inspected}</td>
                  <td className="text-right">{saleable}</td>
                  <td className="text-right">{unsaleable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!stockEnabled && (
          <p className="mt-4 text-sm border border-slate-200 rounded-lg p-3">
            返送・検品の在庫更新操作は現在無効です。実績の参照のみ可能です。
          </p>
        )}
      </section>
      {stockEnabled && manager && stockPostable && (
        <section className="space-y-4 mb-5" aria-label="返送・検品の在庫確定操作">
          <h2 className="font-semibold text-lg">現物の返送・検品操作</h2>
          {lines.map(({ line, dispatched, inspected }) => {
            const remainingApproved = line.approvedQuantity - dispatched;
            const availableToInspect = dispatched - inspected;
            if (isBuyer && remainingApproved > 0) {
              return (
                <BuyerReturnDispatchForm key={line.id}
                  requestId={request.id} returnItemId={line.id} eventId={randomUUID()}
                  itemName={line.sourceLine.itemName} unit={line.sourceLine.unit}
                  remainingApproved={remainingApproved}/>
              );
            }
            if (!isBuyer && availableToInspect > 0) {
              return (
                <SellerReturnInspectionForm key={line.id}
                  requestId={request.id} returnItemId={line.id} eventId={randomUUID()}
                  itemName={line.sourceLine.itemName} unit={line.sourceLine.unit}
                  availableToInspect={availableToInspect}/>
              );
            }
            return null;
          })}
        </section>
      )}
      <p className="text-sm text-amber-900 border border-amber-200 bg-amber-50 rounded-lg p-4">
        返品の申請・審査は在庫を更新しません。
        返送確定では買い手在庫を減算し、売り手検品確定では良品だけを加算します。
        現物返送・検品を記録しても、元の請求金額・クレジットノート・返金は自動変更されません。
        審査ステータスと現物実績は別管理で、正式な物理ステータス変更は後続の監査付き機能で対応します。
      </p>
    </>
  );
}
