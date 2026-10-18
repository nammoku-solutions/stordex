import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen } from "@/lib/format";
import { acceptInboundPurchaseOrder, rejectInboundPurchaseOrder } from "../actions";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";

export const dynamic = "force-dynamic";

export default async function InboundOrderDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { tenantId, role } = await requireTenant();
  const { id } = await params;
  const order = await prisma.intercompanyOrder.findFirst({
    where: { id, sellerTenantId: tenantId },
    include: {
      buyer: { select: { name: true, slug: true } },
      items: { orderBy: { id: "asc" } },
      sellerOrder: { select: { id: true, orderNumber: true, status: true } },
    },
  });
  if (!order) notFound();
  const canProcess = order.status === "SENT" && (role === "OWNER" || role === "ADMIN");
  const [customers, products] = canProcess ? await Promise.all([
    prisma.customer.findMany({
      where: { tenantId, active: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
      take: 300,
    }),
    prisma.item.findMany({
      where: { tenantId, active: true },
      select: { id: true, code: true, name: true, unit: true },
      orderBy: { code: "asc" },
      take: 1000,
    }),
  ]) : [[], []];

  return (
    <>
      <PageHeader
        title={`受信発注 ${order.poNumber}`}
        description={`${order.buyer.name}（${order.buyer.slug}）からの企業間発注`}
        action={<Link href="/orders/inbox" className="btn-secondary">受信一覧へ戻る</Link>}
      />
      <div className="grid md:grid-cols-3 gap-4 mb-5">
        <div className="card p-4"><div className="text-xs text-slate-500">発注日</div>{dateJP(order.orderDate)}</div>
        <div className="card p-4"><div className="text-xs text-slate-500">引取希望日</div>{dateJP(order.deliveryDate)}</div>
        <div className="card p-4"><div className="text-xs text-slate-500">発注合計</div><strong>{yen(order.total)}</strong></div>
      </div>
      <div className="card p-4 mb-5">
        <div className="font-semibold">受信状態: {order.status}</div>
        {order.sellerOrder && (
          <p className="mt-2">受注登録済み:
            <Link className="ml-2 underline text-blue-700" href={`/orders/${order.sellerOrder.id}`}>
              {order.sellerOrder.orderNumber} ({order.sellerOrder.status})
            </Link>
          </p>
        )}
        {order.note && <p className="mt-2 text-sm whitespace-pre-wrap">{order.note}</p>}
      </div>

      {canProcess ? (
        <>
          <p className="mb-4 text-sm text-amber-800">
            発注元の商品コードと自社の商品コードは別物です。必ず内容・単位・金額を確認し、
            すべての明細に自社商品を割り当ててください。取り込み後は受注下書きが生成され、
            在庫は減算されません。
          </p>
          <form action={acceptInboundPurchaseOrder} className="space-y-5">
            <input type="hidden" name="inboundId" value={order.id}/>
            <div className="card p-5">
              <label className="label">自社の得意先（発注元企業に対応する顧客）*</label>
              <select className="input" name="customerId" required>
                <option value="">選択してください</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
              </select>
            </div>
            <div className="card p-5">
              <h2 className="font-semibold mb-3">明細と商品コードの対応付け</h2>
              <div className="space-y-4">
                {order.items.map(line => {
                  const matches = products.filter(p => p.unit === line.unit);
                  return (
                    <div className="border-b border-slate-200 pb-4" key={line.id}>
                      <p className="text-sm font-medium">{line.buyerItemCode} / {line.itemName}</p>
                      <p className="text-sm text-slate-500">
                        {line.quantity} {line.unit} × {yen(line.unitPrice)} = {yen(line.amount)}
                      </p>
                      <label className="label mt-2">自社商品（単位: {line.unit}）*</label>
                      <select className="input" name={`item_${line.id}`} required>
                        <option value="">選択してください</option>
                        {matches.map(p => (
                          <option key={p.id} value={p.id}>{p.code} {p.name} ({p.unit})</option>
                        ))}
                      </select>
                      {matches.length === 0 && <p className="text-xs text-red-700">対応する単位の商品がありません。まず商品マスタへ登録してください。</p>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <PendingSubmitButton
                pendingLabel="受注下書きを作成中…"
                disabled={!customers.length || order.items.some(l => !products.some(p => p.unit === l.unit))}
              >
                確認した内容で受注下書きを作成
              </PendingSubmitButton>
              <Link href="/items" className="btn-secondary">商品マスタへ</Link>
            </div>
          </form>
          <form action={rejectInboundPurchaseOrder} className="mt-6 card p-4">
            <input type="hidden" name="inboundId" value={order.id}/>
            <p className="text-xs text-slate-600 mb-2">この発注を受けられない場合は、辞退できます。後から取り消せません。</p>
            <PendingSubmitButton className="btn-danger" pendingLabel="辞退を処理中…">この発注を辞退する</PendingSubmitButton>
          </form>
        </>
      ) : order.status === "SENT" ? (
        <p className="card p-5 text-sm">管理者（OWNER / ADMIN）が受注処理を行います。</p>
      ) : (
        <p className="card p-5 text-sm">この発注は処理済みです。再取り込みはできません。</p>
      )}
    </>
  );
}
