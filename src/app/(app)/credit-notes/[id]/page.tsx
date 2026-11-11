import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { dateJP, yen } from "@/lib/format";
import { b2bCreditDraftEnabled } from "@/lib/b2b-credit-draft-feature";

export const dynamic="force-dynamic";

/** Read-only confirmation. A DRAFT is not an issued credit or financial posting. */
export default async function CreditDraftDetailPage({params}:{
  params:Promise<{id:string}>;
}){
  if(!b2bCreditDraftEnabled())notFound();
  const {tenantId}=await requireTenant();
  const {id}=await params;
  const note=await prisma.b2BCreditNote.findFirst({
    where:{id,sellerTenantId:tenantId},
    include:{
      originalInvoice:{select:{id:true,invoiceNumber:true,status:true}},
      returnRequest:{select:{id:true,requestNumber:true,status:true}},
      lines:{include:{returnItem:{include:{sourceLine:true}}},orderBy:{returnItemId:"asc"}},
    },
  });
  if(!note)notFound();
  return (<>
    <PageHeader title={`CreditNote下書き ${note.creditNoteNumber}`}
      description="これは数量割当だけを記録した下書きです。正式発行・返金・入金相殺は行いません。"
      action={<Link href={`/invoices/${note.originalInvoice.id}`} className="btn-secondary">元請求書に戻る</Link>}/>
    <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
      <div className="card p-4"><p className="text-xs text-slate-500">状態</p><strong>下書き（DRAFT）</strong></div>
      <div className="card p-4"><p className="text-xs text-slate-500">作成日時</p>{dateJP(note.createdAt)}</div>
      <div className="card p-4"><p className="text-xs text-slate-500">通貨</p>{note.currencyCode}</div>
    </section>
    <section className="card p-5 mb-5 space-y-2">
      <h2 className="font-semibold">元の請求書と返品</h2>
      <p>請求書：<Link href={`/invoices/${note.originalInvoice.id}`} className="underline text-blue-700">{note.originalInvoice.invoiceNumber}</Link>（{note.originalInvoice.status}）</p>
      <p>返品申請：{note.returnRequest.requestNumber}（{note.returnRequest.status}）</p>
      <p>元請求額：{yen(note.originalInvoiceTotal)}</p>
      <p className="text-sm text-slate-600">
        元請求額は履歴用のスナップショットです。CreditNoteの調整額ではありません。
      </p>
    </section>
    <section className="card p-5 mb-5">
      <h2 className="font-semibold mb-3">返品数量の下書き割当</h2>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>商品</th><th className="text-right">割当数量</th><th className="text-right">提案金額</th></tr></thead>
          <tbody>{note.lines.map(line=>(
            <tr key={line.id}>
              <td>{line.returnItem.sourceLine.itemName}</td>
              <td className="text-right">{line.creditedQuantity} {line.returnItem.sourceLine.unit}</td>
              <td className="text-right">未設定</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
    <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      この下書きは取消・削除できません。金額と税額は未確定で、元請求書の合計・売り手／買い手在庫・返金・入金額は変更されません。
      発行・金額調整の機能は別途レビュー・承認が必要です。
    </p>
  </>);
}
