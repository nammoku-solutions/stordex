"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/session";
import { b2bCreditDraftEnabled } from "@/lib/b2b-credit-draft-feature";
import {
  parseCreditDraftForm, CreditDraftFormError,
} from "@/lib/b2b-credit-draft-form";
import {
  createB2BCreditNoteDraft, CreditDraftServiceError,
} from "@/lib/b2b-credit-note-draft-service";

export type CreditDraftActionState={error:string|null};

/**
 * Manual, explicit seller OWNER/ADMIN action. There is no auto-create on
 * render, no invoice update, no refund, and no credit issuance.
 * Source status, buyer/seller tenancy, invoice and quantities are also
 * validated inside the serializable service + PostgreSQL trigger.
 */
export async function createCreditDraftForm(
  _previous:CreditDraftActionState,
  formData:FormData,
):Promise<CreditDraftActionState> {
  if(!b2bCreditDraftEnabled()){
    return {error:"CreditNote下書き機能は現在無効です"};
  }
  const {tenantId,userId,role}=await requireTenant();
  if(role!=="OWNER"&&role!=="ADMIN"){
    return {error:"CreditNote下書きの作成には売り手企業の管理者権限が必要です"};
  }
  let creditNoteId:string;
  try{
    const req=parseCreditDraftForm(formData);
    const result=await createB2BCreditNoteDraft({
      sellerTenantId:tenantId,
      userId,
      originalInvoiceId:req.originalInvoiceId,
      returnRequestId:req.returnRequestId,
      idempotencyKey:req.idempotencyKey,
      currencyCode:"JPY",
      lines:req.lines,
    });
    creditNoteId=result.creditNoteId;
  }catch(error){
    if(error instanceof CreditDraftFormError ||
       error instanceof CreditDraftServiceError){
      return {error:error.message};
    }
    return {error:"下書きを作成できませんでした。請求書と返品の内容を再確認してください。"};
  }
  revalidatePath("/invoices");
  revalidatePath("/credit-notes/"+creditNoteId);
  redirect("/credit-notes/"+creditNoteId);
}
