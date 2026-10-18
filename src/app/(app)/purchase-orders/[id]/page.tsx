import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen, num, ORDER_STATUS_LABEL } from "@/lib/format";
import { PO_STATUS_BADGE, PO_STATUS_LABEL } from "../_status";
import { POStatusActions } from "./POStatusActions";
import { sendPurchaseOrderToPartner } from "../send-actions";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";

export default async function POPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId, role } = await requireTenant();
  const { id } = await params;
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    include: {
      supplier: true,
      items: { include: { item: true } },
      linkedCompanyOrder: {
        include: {
          seller: { select: { name: true, slug: true } },
          sellerOrder: { select: { orderNumber: true, status: true } },
        },
      },
    },
  });
  if (!po) notFound();
  const canSend = po.status === "ORDERED" && !po.linkedCompanyOrder &&
    (role === "OWNER" || role === "ADMIN");
  const connections = canSend ? await prisma.tradingConnection.findMany({
    where: { status: "ACTIVE", OR: [{ tenantAId: tenantId }, { tenantBId: tenantId }] },
    include: {
      tenantA: { select: { id: true, name: true, status: true } },
      tenantB: { select: { id: true, name: true, status: true } },
    },
  }) : [];
  const partners = connections
    .map(link => link.tenantAId === tenantId ? link.tenantB : link.tenantA)
    .filter(partner => partner.status === "ACTIVE");

  return (
    <>
      <PageHeader
        title={`発注 ${po.poNumber}`}
        action={
          <div className="flex items-center gap-3">
            <Link
              href={`/print/purchase-orders/${po.id}`}
              target="_blank"
              className="btn-secondary"
            >
              発注書を印刷
            </Link>
            <span className={`badge ${PO_STATUS_BADGE[po.status]} text-sm`}>
              {PO_STATUS_LABEL[po.status]}
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs text-slate-500">仕入先</div>
          <div className="font-medium">{po.supplier.name}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">発注日 / 引取予定日</div>
          <div>{dateJP(po.orderDate)} → {dateJP(po.pickupDate)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">合計</div>
          <div className="text-xl font-bold">{yen(po.total)}</div>
        </div>
      </div>

      <div className="card table-wrap mb-6">
        <table className="tbl">
          <thead>
            <tr>
              <th>商品コード</th>
              <th>商品名</th>
              <th className="text-right">数量</th>
              <th className="text-right">入荷済</th>
              <th className="text-right">単価</th>
              <th className="text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((l) => (
              <tr key={l.id}>
                <td className="font-mono">{l.item.code}</td>
                <td>{l.itemName}</td>
                <td className="text-right">{num(l.quantity)} {l.unit}</td>
                <td className="text-right">{num(l.received)}</td>
                <td className="text-right">{yen(l.unitPrice)}</td>
                <td className="text-right font-medium">{yen(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {po.linkedCompanyOrder && (
        <div className="card p-5 mb-5">
          <h2 className="font-semibold mb-2">企業間発注の送信状況</h2>
          <p>送信先: {po.linkedCompanyOrder.seller.name}</p>
          <p>受け取り状態: {po.linkedCompanyOrder.status === "ACCEPTED"
            ? "受注登録済み" : po.linkedCompanyOrder.status === "SENT"
            ? "相手の確認待ち" : po.linkedCompanyOrder.status === "REJECTED"
            ? "受注辞退" : "発注取消"}</p>
          {po.linkedCompanyOrder.sellerOrder &&
            <p className="text-sm">
              先方の受注: {po.linkedCompanyOrder.sellerOrder.orderNumber} /
              <strong className="ml-1">
                {ORDER_STATUS_LABEL[po.linkedCompanyOrder.sellerOrder.status]}
              </strong>
            </p>
          }
          {po.linkedCompanyOrder.sellerOrder?.status === "SHIPPED" &&
            po.status === "ORDERED" && (
              <p className="text-sm text-amber-800">
                先方で出荷済みです。現品を確認してから入荷確定してください。
              </p>
            )}
          {po.status === "RECEIVED" &&
            <p className="text-sm text-emerald-700">
              自社で入荷確定済みです。
            </p>}
          <p className="text-xs text-slate-500">
            先方の受注状態を参照しています。自社の入荷処理が自動的に実行されるわけではありません。
          </p>
        </div>
      )}
      {canSend && (
        <div className="card p-5 mb-5 space-y-3">
          <h2 className="text-lg font-semibold">Stordex利用企業へ発注を送信</h2>
          {partners.length === 0 ? (
            <p className="text-sm">接続済み企業がありません。
              <Link href="/network" className="underline text-blue-700 ml-2">企業間接続へ</Link>
            </p>
          ) : (
            <form action={sendPurchaseOrderToPartner} className="space-y-3">
              <input type="hidden" name="purchaseOrderId" value={po.id}/>
              <div>
                <label className="label">送信先（接続済みの会社）*</label>
                <select className="input" name="partnerId" required defaultValue="">
                  <option value="">選択してください</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <p className="text-sm text-amber-800">
                自社の仕入先「{po.supplier.name}」と選択した送信先企業が一致するか、
                必ず確認してください。送信後は別企業の受信トレイに明細が届きます。
              </p>
              <label className="flex gap-2 text-sm items-start">
                <input type="checkbox" name="confirmRecipient" value="yes" required className="mt-1"/>
                発注書の内容・数量・金額・送信先企業を確認しました
              </label>
              <button type="submit" className="btn-primary">この企業へ発注書を送信</button>
            </form>
          )}
        </div>
      )}
      {po.linkedCompanyOrder?.sellerOrder?.status === "CANCELLED" && po.status === "ORDERED" && (
        <p className="card p-4 mb-5 text-sm text-amber-800" role="status">
          受注先が出荷前の受注を取り消しました。内容を確認し、下部の「取消」から自社の発注も取り消してください。
        </p>
      )}
      <POStatusActions
        id={po.id}
        status={po.status}
        linkedStatus={po.linkedCompanyOrder?.status}
        sellerOrderStatus={po.linkedCompanyOrder?.sellerOrder?.status}
        canManageLinkedCancellation={role === "OWNER" || role === "ADMIN"}
      />
    </>
  );
}
