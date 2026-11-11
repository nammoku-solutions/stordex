/**
 * Void ONLY a seller-owned DRAFT CreditNote. This preserves the original
 * note and line records but releases the inspected quantities for a new draft.
 * Event audit is written by the PostgreSQL AFTER UPDATE trigger atomically.
 *
 * No money, invoices, inventory, payments or refunds are modified here.
 * DO NOT expose on Staging before 11th migration + owner authorization.
 */
import { prisma } from "@/lib/db";
import { lockBuyerPurchaseOrder, lockCompanyConnection } from "@/lib/b2b-locks";
import type { Prisma } from "@/generated/prisma/client";

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export class CreditVoidError extends Error {
  constructor(message:string){super(message);this.name="CreditVoidError";}
}
function fail(message:string):never {throw new CreditVoidError(message);}

async function requireSellerManager(tx:Prisma.TransactionClient,tenantId:string,userId:string){
  const actor=await tx.user.findFirst({
    where:{id:userId,tenantId,role:{in:["OWNER","ADMIN"]},tenant:{status:"ACTIVE"}},
    select:{id:true},
  });
  if(!actor)fail("下書き取消には売り手企業の有効な管理者権限が必要です");
}

export async function voidB2BCreditNoteDraft(input:{
  sellerTenantId:string;userId:string;creditNoteId:string;
  eventId:string;reason:string;
}):Promise<{creditNoteId:string;voided:boolean}>{
  const reason=input.reason?.trim();
  if(!input.sellerTenantId || !input.userId || !input.creditNoteId ||
     !UUID.test(input.eventId) || !reason ||
     reason.length<8 || reason.length>500){
    fail("取消対象・イベントID・取消理由（8〜500文字）を確認してください");
  }
  const eventId=input.eventId.toLowerCase();

  for(let attempt=0;attempt<3;attempt++){
    try{
      return await prisma.$transaction(async tx=>{
        await requireSellerManager(tx,input.sellerTenantId,input.userId);
        const locator=await tx.b2BCreditNote.findFirst({
          where:{id:input.creditNoteId,sellerTenantId:input.sellerTenantId},
          select:{
            id:true,returnRequestId:true,originalInvoiceId:true,
            returnRequest:{select:{companyOrder:{select:{
              buyerTenantId:true,purchaseOrderId:true,connectionId:true,
            }}}},
            lines:{select:{returnItemId:true},orderBy:{returnItemId:"asc"}},
          },
        });
        if(!locator)fail("取消できるCreditNote下書きが見つかりません");

        // Match creation lock order: Buyer PO → Connection → Return →
        // sorted return items → original Invoice → CreditNote header.
        await lockBuyerPurchaseOrder(
          tx,locator.returnRequest.companyOrder.buyerTenantId,
          locator.returnRequest.companyOrder.purchaseOrderId,
        );
        await lockCompanyConnection(tx,locator.returnRequest.companyOrder.connectionId);
        const lockedReturn=await tx.$queryRaw<{id:string}[]>`
          SELECT id FROM "B2BReturnRequest"
          WHERE id=${locator.returnRequestId}
            AND "sellerTenantId"=${input.sellerTenantId} FOR UPDATE
        `;
        if(lockedReturn.length!==1)fail("元の返品申請が見つかりません");
        for(const line of locator.lines){
          const locked=await tx.$queryRaw<{id:string}[]>`
            SELECT id FROM "B2BReturnItem"
            WHERE id=${line.returnItemId}
              AND "returnRequestId"=${locator.returnRequestId}
            FOR UPDATE
          `;
          if(locked.length!==1)fail("返品明細が変更されました");
        }
        const invoice=await tx.$queryRaw<{id:string}[]>`
          SELECT id FROM "Invoice"
          WHERE id=${locator.originalInvoiceId}
            AND "tenantId"=${input.sellerTenantId}
          FOR UPDATE
        `;
        if(invoice.length!==1)fail("元請求書が見つかりません");
        const notes=await tx.$queryRaw<{
          id:string;status:string;voidEventId:string|null;
          voidedByUserId:string|null;voidReason:string|null;
        }[]>`
          SELECT id,status,"voidEventId","voidedByUserId","voidReason"
          FROM "B2BCreditNote"
          WHERE id=${locator.id} AND "sellerTenantId"=${input.sellerTenantId}
          FOR UPDATE
        `;
        if(notes.length!==1)fail("対象の下書きが見つかりません");
        const current=notes[0];
        if(current.status==="VOID"){
          if(current.voidEventId!==eventId ||
             current.voidedByUserId!==input.userId ||
             current.voidReason!==reason){
            fail("取消済みの下書きです。別の操作として再取消できません");
          }
          const audit=await tx.b2BCreditVoidEvent.findUnique({
            where:{creditNoteId:current.id},select:{eventId:true},
          });
          if(audit?.eventId!==eventId){
            fail("取消監査履歴の照合に失敗しました");
          }
          return {creditNoteId:current.id,voided:false};
        }
        if(current.status!=="DRAFT"){
          fail("取消できるのは未発行のDRAFTだけです");
        }
        // No line deletion: status changes DRAFT→VOID exactly once.
        // DB trigger validates actor, records immutable event, and makes
        // historical lines cease reserving inspected quantities.
        const changed=await tx.b2BCreditNote.updateMany({
          where:{id:current.id,sellerTenantId:input.sellerTenantId,status:"DRAFT"},
          data:{status:"VOID",voidEventId:eventId,voidedByUserId:input.userId,voidReason:reason},
        });
        if(changed.count!==1)fail("下書きが同時に変更されました");
        const audit=await tx.b2BCreditVoidEvent.findUnique({
          where:{creditNoteId:current.id},
          select:{eventId:true,actorUserId:true,reason:true},
        });
        if(audit?.eventId!==eventId || audit.actorUserId!==input.userId ||
           audit.reason!==reason){
          fail("取消監査履歴の作成に失敗しました");
        }
        return {creditNoteId:current.id,voided:true};
      },{isolationLevel:"Serializable",timeout:15000});
    }catch(error){
      const code=typeof error==="object"&&error!==null&&"code" in error
        ?error.code:undefined;
      if((code!=="P2034"&&code!=="40001")||attempt===2)throw error;
    }
  }
  throw new Error("Credit void retry limit exhausted");
}
