"use client";

import { useActionState } from "react";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { voidCreditDraftForm } from "./void-actions";

export function CreditVoidForm(props:{creditNoteId:string,eventId:string}){
  const [state,submit]=useActionState(voidCreditDraftForm,{error:null});
  return (
    <form action={submit} className="card p-5 space-y-3" aria-label="CreditNote下書き取消">
      <h2 className="font-semibold text-lg">下書きの取消（VOID）</h2>
      <p className="text-sm">
        取消は元の下書き・割当明細を削除せず監査履歴を記録します。
        対象の検品済み数量は、新しい下書きに再割当できるようになります。
        元請求書・在庫・支払・返金は変更されません。
      </p>
      <input type="hidden" name="creditNoteId" value={props.creditNoteId}/>
      <input type="hidden" name="eventId" value={props.eventId}/>
      <label className="block text-sm space-y-1">
        <span className="font-semibold">取消理由（8〜500文字、監査履歴に保存）</span>
        <textarea name="reason" minLength={8} maxLength={500}
          required rows={3} className="input w-full"
          placeholder="取消理由を具体的に入力してください"/>
      </label>
      {state.error&&
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>}
      <label className="flex gap-2 text-sm">
        <input type="checkbox" name="confirmed" value="yes" required/>
        <span>元の下書きが取消済みとなり、数量の割当が解除されることを確認しました。</span>
      </label>
      <PendingSubmitButton pendingLabel="取消を監査記録中…">下書きを取消（VOID）</PendingSubmitButton>
    </form>
  );
}
