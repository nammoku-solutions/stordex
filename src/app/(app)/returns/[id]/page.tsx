import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP } from "@/lib/format";
import { b2bReturnFormsEnabled } from "@/lib/b2b-return-feature";
import { B2B_RETURN_STATUS_LABEL, B2B_RETURN_REASON_LABEL } from "@/lib/b2b-return-labels";
import { ReturnReviewForm } from "../ReturnReviewForm";
import { assessB2BReturnProgress, type ReturnProgressPhase } from "@/lib/b2b-return-progress";

const PHASE_LABELS: Record<ReturnProgressPhase, string> = {
  WAITING_REVIEW: "売り手の審査待ち",
  REJECTED: "返品が否認されました",
  WITHDRAWN: "返品が取り下げられました",
  AWAITING_DISPATCH: "返送待ち",
  IN_TRANSIT: "返送中・売り手の検品待ち",
  PARTIALLY_INSPECTED: "一部検品済み",
  PARTIALLY_RETURNED: "一部返品が完了・残数返送待ち",
  AWAITING_CREDIT_REVIEW: "現品検品済み・会計確認待ち",
  CLOSED_MANUALLY: "返品完了（別途会計処理を確認）",
};

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
      items: {
        orderBy: { id: "asc" },
        include: {
          sourceLine: true,
          stockEvents: { select: { phase: true, quantity: true } },
          creditLines: {
            select: {
              creditedQuantity: true,
              creditNote: { select: { status: true } },
            },
          },
        },
      },
    },
  });
  if (!request) notFound();
  const isBuyer = request.buyerTenantId === tenantId;
  // These are historical recorded events, not inferred changes to stock or
  // accounting. Inconsistent legacy event rows must show a warning rather
  // than imply a successful return.
  let progress: ReturnType<typeof assessB2BReturnProgress> | null = null;
  try {
    progress = assessB2BReturnProgress({
      status: request.status,
      lines: request.items.map(line => ({
        id: line.id,
        requested: line.requestedQuantity,
        approved: line.approvedQuantity,
        dispatched: line.stockEvents
          .filter(event => event.phase === "DISPATCH")
          .reduce((sum, event) => sum + event.quantity, 0),
        inspected: line.stockEvents
          .filter(event => event.phase === "INSPECTION")
          .reduce((sum, event) => sum + event.quantity, 0),
        draftCreditAllocated: line.creditLines
          .filter(credit => credit.creditNote.status !== "VOID")
          .reduce((sum, credit) => sum + credit.creditedQuantity, 0),
      })),
    });
  } catch {
    // Do not leak SQL or internal implementation details to other tenants.
    progress = null;
  }
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
      <section className="card p-4 mb-5" aria-label="返品の処理進捗">
        <h2 className="text-lg font-semibold mb-3">現品返送・検品・金額調整案の進捗</h2>
        {!progress ? (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">
            返品履歴の数量または状態に不整合があります。操作せず管理者へ連絡してください。
          </p>
        ) : (
          <>
            <p className="font-medium">{PHASE_LABELS[progress.phase]}</p>
            <dl className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><dt className="text-slate-500">承認済み</dt><dd className="font-semibold">{progress.summary.approved}</dd></div>
              <div><dt className="text-slate-500">返送済み</dt><dd className="font-semibold">{progress.summary.dispatched}</dd></div>
              <div><dt className="text-slate-500">検品済み</dt><dd className="font-semibold">{progress.summary.inspected}</dd></div>
              <div><dt className="text-slate-500">金額調整案に割当済み</dt><dd className="font-semibold">{progress.summary.draftCreditAllocated}</dd></div>
              <div><dt className="text-slate-500">未返送の承認数</dt><dd>{progress.summary.notYetDispatched}</dd></div>
              <div><dt className="text-slate-500">輸送中・未検品</dt><dd>{progress.summary.inTransit}</dd></div>
              <div><dt className="text-slate-500">検品済み・調整案未割当</dt><dd>{progress.summary.inspectedUnallocated}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-amber-900">{progress.warning}</p>
            {progress.canConsiderCreditDraft && (
              <p className="mt-2 text-xs text-slate-600">
                金額調整案を作成するには、元請求書の税計算・入金状況・返金方法を別途確認してください。
              </p>
            )}
          </>
        )}
      </section>
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
