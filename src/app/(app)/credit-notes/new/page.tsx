import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { b2bCreditDraftEnabled } from "@/lib/b2b-credit-draft-feature";
import { assessCreditDraftReadiness } from "@/lib/b2b-credit-draft-readiness";
import { CreditDraftForm } from "../CreditDraftForm";

export const dynamic="force-dynamic";

export default async function NewCreditDraftPage({searchParams}:{
  searchParams:Promise<{returnRequestId?:string}>;
}){
  if(!b2bCreditDraftEnabled())notFound();
  const {tenantId,role}=await requireTenant();
  if(role!=="OWNER"&&role!=="ADMIN")notFound();
  const {returnRequestId}=await searchParams;
  if(!returnRequestId || !/^[A-Za-z0-9_-]{1,128}$/.test(returnRequestId))notFound();
  const request=await prisma.b2BReturnRequest.findFirst({
    where:{id:returnRequestId,sellerTenantId:tenantId},
    include:{
      companyOrder:{select:{poNumber:true,sellerOrderId:true}},
      items:{orderBy:{id:"asc"},include:{
        sourceLine:true,
        stockEvents:{where:{phase:"INSPECTION"},select:{quantity:true}},
        // Retain VOID lines for audit but do not count them as active
        // reserved quantities when preparing a replacement Draft.
        creditLines:{
          where:{creditNote:{status:{not:"VOID"}}},
          select:{creditedQuantity:true},
        },
      }},
    },
  });
  if(!request)notFound();
  const orderId=request.companyOrder.sellerOrderId;
  const invoices=orderId?await prisma.invoice.findMany({
    where:{
      tenantId,status:{in:["ISSUED","PAID"]},
      orders:{some:{orderId}},
    },
    select:{
      id:true,invoiceNumber:true,status:true,
      subtotal:true,tax:true,total:true,
      tenantId:true,orders:{select:{orderId:true}},
    },
    take:10,orderBy:{createdAt:"desc"},
  }):[];
  const invoice=invoices.length===1?invoices[0]:null;
  const lines=request.items.map(item=>{
    const inspected=item.stockEvents.reduce((n,e)=>n+e.quantity,0);
    const allocated=item.creditLines.reduce((n,e)=>n+e.creditedQuantity,0);
    const readiness=assessCreditDraftReadiness({
      returnStatus:request.status,approved:item.approvedQuantity,
      inspected,alreadyAllocated:allocated,
      sellerOrderId:orderId,sellerTenantId:tenantId,
      originalInvoice:invoice?{
        status:invoice.status,tenantId:invoice.tenantId,
        orderIds:invoice.orders.map(x=>x.orderId),
      }:null,
    });
    return {
      id:item.id,itemName:item.sourceLine.itemName,unit:item.sourceLine.unit,
      inspected,previouslyAllocated:allocated,available:readiness.remainingInspectedUnits,
      blocker:readiness.blocker,
    };
  });
  const eligible=invoice!==null&&lines.some(x=>x.available>0);
  return (<>
    <PageHeader title="返品CreditNote下書き"
      description={`企業間発注 ${request.companyOrder.poNumber}・返品申請 ${request.requestNumber}`}
      action={<Link href="/invoices" className="btn-secondary">請求書一覧へ</Link>}/>
    <section className="card p-4 mb-4 space-y-2">
      <p>返品ステータス：<strong>{request.status==="INSPECTED"?"検品済み":request.status}</strong></p>
      <p>発行済みの元請求書：{invoice?
        <Link href={`/invoices/${invoice.id}`} className="underline text-blue-700">{invoice.invoiceNumber}</Link>
        : invoices.length>1?"複数候補があります（この画面では選択不可）":"見つかりません"}</p>
      <p className="text-sm text-slate-600">
        CreditNoteは現在、税額・返金額を計算しない下書き専用です。
        売り手のOWNER/ADMIN以外は表示・作成できません。
      </p>
    </section>
    {eligible&&invoice?(
      <CreditDraftForm returnRequestId={request.id}
        originalInvoiceId={invoice.id}
        idempotencyKey={randomUUID()}
        invoiceNumber={invoice.invoiceNumber}
        originalInvoiceTotal={invoice.total}
        items={lines.map(({blocker,...x})=>x)}/>
    ):(
      <section className="card p-5" role="status">
        <h2 className="font-semibold">下書き作成の条件を満たしていません</h2>
        <p className="text-sm mt-2">元請求書（発行済み）・売り手受注・正式検品済みステータス・未割当数量を確認してください。</p>
        {invoices.length>1&&<p className="text-sm">元請求書が複数あるため、誤った紐付けを防ぐ目的で作成を停止しています。</p>}
        <p className="text-sm">検品済みの数量がすでにすべて下書きに割り当てられている場合も作成できません。</p>
      </section>
    )}
  </>);
}
