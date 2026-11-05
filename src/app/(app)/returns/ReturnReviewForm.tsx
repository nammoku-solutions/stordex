"use client";

import { useActionState } from "react";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { B2B_RETURN_REASON_LABEL } from "@/lib/b2b-return-labels";
import { reviewB2BReturnForm } from "./actions";

export type ReviewSourceLine = {
  sourceLineId: string;
  itemName: string;
  unit: string;
  requestedQuantity: number;
  reason: keyof typeof B2B_RETURN_REASON_LABEL;
  note: string | null;
};

export function ReturnReviewForm({ requestId, lines }: {
  requestId: string; lines: readonly ReviewSourceLine[];
}) {
  const [state, action] = useActionState(reviewB2BReturnForm, { error: null });
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="requestId" value={requestId}/>
      <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-3 text-sm">
        審査で決定した数量は後から変更できません。0は否認、一部の数量は一部承認です。
        承認しても在庫・入出庫記録・返金額は変更されません。
      </div>
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">
          {state.error}
        </div>
      )}
      {lines.map(line => (
        <fieldset key={line.sourceLineId} className="border-b border-slate-200 pb-4 space-y-2">
          <input type="hidden" name="sourceLineId" value={line.sourceLineId}/>
          <legend className="font-semibold">{line.itemName}</legend>
          <p className="text-sm text-slate-600">
            申請 {line.requestedQuantity} {line.unit}／理由: {B2B_RETURN_REASON_LABEL[line.reason]}
          </p>
          {line.note && <p className="text-sm whitespace-pre-wrap">{line.note}</p>}
          <label className="block text-sm font-medium" htmlFor={`approved-${line.sourceLineId}`}>
            承認する数量
          </label>
          <input id={`approved-${line.sourceLineId}`}
            className="input max-w-48" type="number"
            name={`approved_${line.sourceLineId}`}
            min={0} max={line.requestedQuantity} step={1}
            defaultValue={line.requestedQuantity} required/>
        </fieldset>
      ))}
      <label className="block text-sm font-medium" htmlFor="return-review-note">
        審査コメント（一部承認・否認では必須、500文字以内）
      </label>
      <textarea id="return-review-note" name="reviewNote" className="input"
        maxLength={500} rows={3}/>
      <PendingSubmitButton pendingLabel="審査を確定中…">
        審査結果を確定する
      </PendingSubmitButton>
    </form>
  );
}
