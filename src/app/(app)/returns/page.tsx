import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP } from "@/lib/format";
import { b2bReturnFormsEnabled } from "@/lib/b2b-return-feature";
import { B2B_RETURN_STATUS_LABEL } from "@/lib/b2b-return-labels";

export const dynamic = "force-dynamic";

export default async function B2BReturnIndexPage() {
  if (!b2bReturnFormsEnabled()) notFound();
  const { tenantId } = await requireTenant();
  const requests = await prisma.b2BReturnRequest.findMany({
    where: { OR: [{ buyerTenantId: tenantId }, { sellerTenantId: tenantId }] },
    orderBy: { createdAt: "desc" }, take: 100,
    select: {
      id: true, requestNumber: true, status: true, createdAt: true,
      buyerTenantId: true, companyOrder: {
        select: { poNumber: true, purchaseOrderId: true, sellerOrderId: true },
      },
    },
  });
  return (
    <>
      <PageHeader title="企業間返品" description="返品申請・審査履歴（出荷後）"
        action={<Link href="/purchase-orders" className="btn-secondary">発注管理へ</Link>}/>
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-5 text-sm text-amber-900">
        返品の申請・承認だけでは入出庫や返金は実行されません。現品返送・検品・金額調整は別工程です。
      </p>
      <div className="card table-wrap">
        <table className="tbl">
          <thead><tr><th>申請番号</th><th>元の発注番号</th><th>立場</th><th>状態</th><th>申請日</th></tr></thead>
          <tbody>
            {requests.map(request => (
              <tr key={request.id}>
                <td><Link href={`/returns/${request.id}`} className="underline text-blue-700">
                  {request.requestNumber}
                </Link></td>
                <td>{request.companyOrder.poNumber}</td>
                <td>{request.buyerTenantId === tenantId ? "申請元（買い手）" : "審査側（売り手）"}</td>
                <td>{B2B_RETURN_STATUS_LABEL[request.status]}</td>
                <td>{dateJP(request.createdAt)}</td>
              </tr>
            ))}
            {!requests.length && (
              <tr><td colSpan={5} className="text-center text-slate-500 py-6">
                返品申請はまだありません。返品対象の仕入発注詳細から申請してください。
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
