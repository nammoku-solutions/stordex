"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/session";
import { b2bCreditVoidEnabled } from "@/lib/b2b-credit-void-feature";
import { parseCreditVoidForm,CreditVoidFormError } from "@/lib/b2b-credit-void-form";
import { voidB2BCreditNoteDraft,CreditVoidError } from "@/lib/b2b-credit-note-void-service";

export type CreditVoidState={error:string|null};
export async function voidCreditDraftForm(
  _previous:CreditVoidState,formData:FormData,
):Promise<CreditVoidState>{
  if(!b2bCreditVoidEnabled()){
    return {error:"CreditNote下書き取消機能は現在無効です"};
  }
  const {tenantId,userId,role}=await requireTenant();
  if(role!=="OWNER"&&role!=="ADMIN"){
    return {error:"取消には売り手企業の管理者権限が必要です"};
  }
  let creditNoteId:string;
  try{
    const data=parseCreditVoidForm(formData);
    const result=await voidB2BCreditNoteDraft({
      sellerTenantId:tenantId,userId,creditNoteId:data.creditNoteId,
      eventId:data.eventId,reason:data.reason,
    });
    creditNoteId=result.creditNoteId;
  }catch(e){
    if(e instanceof CreditVoidFormError||e instanceof CreditVoidError){
      return {error:e.message};
    }
    return {error:"下書きを取消できませんでした。監査履歴を確認してください"};
  }
  revalidatePath("/invoices");
  revalidatePath("/credit-notes/"+creditNoteId);
  redirect("/credit-notes/"+creditNoteId);
}
