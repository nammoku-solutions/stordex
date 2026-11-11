"use client";

import { useActionState } from "react";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { createCreditDraftForm } from "./actions";

export function CreditDraftForm(props:{
  returnRequestId:string;
  originalInvoiceId:string;
  idempotencyKey:string;
  invoiceNumber:string;
  originalInvoiceTotal:number;
  items:readonly {
    id:string;itemName:string;unit:string;inspected:number;
    previouslyAllocated:number;available:number;
  }[];
}){
  const [state,action]=useActionState(createCreditDraftForm,{error:null});
  const hasAvailable=props.items.some(x=>x.available>0);
  return (
    <form action={action} className="card p-5 space-y-4" aria-label="CreditNote下書き作成">
      <h2 className="font-semibold text-lg">CreditNote下書きの準備（JPY）</h2>
      <p className="text-sm">
        元請求書 <strong>{props.invoiceNumber}</strong> （元請求合計
        <strong> ¥{props.originalInvoiceTotal.toLocaleString("ja-JP")}</strong>）と
        検品記録を確認し、調整対象数量だけを記録します。
      </p>
      <input type="hidden" name="returnRequestId" value={props.returnRequestId}/>
      <input type="hidden" name="originalInvoiceId" value={props.originalInvoiceId}/>
      <input type="hidden" name="idempotencyKey" value={props.idempotencyKey}/>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>商品</th><th className="text-right">検品済</th><th className="text-right">既存下書き割当</th><th className="text-right">今回の割当（数量）</th></tr></thead>
          <tbody>{props.items.map(item=>(
            <tr key={item.id}>
              <td>{item.itemName}</td>
              <td className="text-right">{item.inspected} {item.unit}</td>
              <td className="text-right">{item.previouslyAllocated} {item.unit}</td>
              <td className="text-right">
                <input type="hidden" name="returnItemId" value={item.id}/>
                <input type="number" name="creditedQuantity" required
                  min={0} max={item.available} step={1} defaultValue={item.available}
                  className="input w-28 text-right"
                  aria-label={item.itemName+"の調整数量"}/>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <strong>重要：</strong> これは発行済みCreditNoteではありません。金額・税額は未確定のまま保存され、
        元請求書・在庫・入金・返金を変更しません。
        ただし、作成した下書きの数量割当は現在取り消しできません。
        同じ検品数量を別の下書きに二重割当できなくなります。
      </div>
      {state.error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
      <label className="flex gap-2 items-start text-sm">
        <input name="confirmed" type="checkbox" value="yes" required className="mt-1"/>
        <span>元請求書・検品済み数量・取消不可の割当を確認し、金額未設定の下書きを作成することに同意します。</span>
      </label>
      <PendingSubmitButton pendingLabel="CreditNote下書きを記録中…" disabled={!hasAvailable}>
        CreditNote下書きを作成
      </PendingSubmitButton>
    </form>
  );
}
