"use client";

import { useActionState } from "react";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { submitB2BReturnForm } from "./actions";

export type EligibleSourceLine = {
  sourceLineId: string;
  itemName: string;
  unit: string;
  ordered: number;
  received: number;
  verifiedSellerLine: boolean;
};

export function ReturnSubmitForm({ companyId, idempotencyKey, lines }: {
  companyId: string; idempotencyKey: string; lines: readonly EligibleSourceLine[];
}) {
  const [state, action] = useActionState(submitB2BReturnForm, { error: null });
  const eligible = lines.some(line => line.verifiedSellerLine && line.received > 0);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <p className="text-sm text-amber-900 rounded-lg border border-amber-200 bg-amber-50 p-3">
        入荷済み数量は返品可能な残数ではありません。申請時に、先行する返品申請、
        売り手の出荷記録と明細対応を再確認します。申請だけでは在庫・請求は変更されません。
      </p>
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 font-medium text-red-800">
          {state.error}
        </div>
      )}
      {lines.map(line => {
        const enabled = line.verifiedSellerLine && line.received > 0;
        return (
          <fieldset key={line.sourceLineId} className="card p-4 space-y-3" disabled={!enabled}>
            <input type="hidden" name="sourceLineId" value={line.sourceLineId}/>
            <legend className="font-semibold px-1">{line.itemName}</legend>
            <p className="text-sm text-slate-600">
              発注 {line.ordered} {line.unit}／入荷記録 {line.received} {line.unit}
            </p>
            {!line.verifiedSellerLine && (
              <p className="text-sm text-red-700">
                元の売り手受注明細との対応IDが確認できません。自動返品は申請できません。
              </p>
            )}
            <label className="block text-sm font-medium" htmlFor={`qty-${line.sourceLineId}`}>
              今回の申請数量（0なら対象外）
            </label>
            <input id={`qty-${line.sourceLineId}`} className="input max-w-48"
              type="number" name={`quantity_${line.sourceLineId}`}
              min={0} max={line.received} step={1} defaultValue={0}
              required disabled={!enabled}/>
            <label className="block text-sm font-medium" htmlFor={`reason-${line.sourceLineId}`}>
              返品理由
            </label>
            <select id={`reason-${line.sourceLineId}`} name={`reason_${line.sourceLineId}`}
              className="input" defaultValue="DAMAGED" disabled={!enabled}>
              <option value="DAMAGED">破損・不良</option>
              <option value="WRONG_ITEM">商品違い</option>
              <option value="UNWANTED">注文変更</option>
              <option value="OTHER">その他</option>
            </select>
            <label className="block text-sm font-medium" htmlFor={`note-${line.sourceLineId}`}>
              詳細（任意・500文字以内）
            </label>
            <textarea id={`note-${line.sourceLineId}`} className="input"
              name={`note_${line.sourceLineId}`} maxLength={500}
              rows={2} disabled={!enabled}/>
          </fieldset>
        );
      })}
      {!eligible && (
        <p className="text-red-800 text-sm" role="status">
          対応が確認できた入荷済み明細がありません。自動申請は利用できません。
        </p>
      )}
      <PendingSubmitButton disabled={!eligible} pendingLabel="返品申請を確認中…">
        返品を申請する（在庫変更なし）
      </PendingSubmitButton>
    </form>
  );
}
