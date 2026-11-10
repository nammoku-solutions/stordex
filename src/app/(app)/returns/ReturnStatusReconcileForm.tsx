"use client";

import { useActionState } from "react";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { B2B_RETURN_STATUS_LABEL } from "@/lib/b2b-return-labels";
import {
  reconcilePhysicalReturnStatusForm,
} from "./status-actions";

type Source = "APPROVED" | "PARTIALLY_APPROVED" |
  "DISPATCHED" | "PARTIALLY_INSPECTED";
type Target = "DISPATCHED" | "PARTIALLY_INSPECTED" | "INSPECTED";

export function ReturnStatusReconcileForm(props: {
  returnRequestId: string;
  eventId: string;
  expectedStatus: Source;
  targetStatus: Target;
  actorSide: "BUYER" | "SELLER";
}) {
  const [state, action] = useActionState(
    reconcilePhysicalReturnStatusForm, { error: null },
  );
  const roleLabel = props.actorSide === "BUYER" ? "買い手" : "売り手";
  return (
    <form action={action} className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <h3 className="font-semibold">正式な返品ステータスを実績に同期</h3>
      <p className="text-sm text-slate-800">
        {roleLabel}の管理者として、記録済みの返送・検品実績を再確認したうえで、
        <strong>{B2B_RETURN_STATUS_LABEL[props.expectedStatus]}</strong>
        から
        <strong>{B2B_RETURN_STATUS_LABEL[props.targetStatus]}</strong>
        へ変更します。
      </p>
      <input type="hidden" name="returnRequestId" value={props.returnRequestId}/>
      <input type="hidden" name="eventId" value={props.eventId}/>
      <input type="hidden" name="expectedStatus" value={props.expectedStatus}/>
      <input type="hidden" name="targetStatus" value={props.targetStatus}/>
      <p className="text-sm text-indigo-900">
        この同期では商品在庫・在庫移動履歴・請求書・返金・クレジットノートを変更しません。
        操作担当者と変更前後の状態が、削除不可の監査履歴に記録されます。
      </p>
      {state.error && (
        <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">
          {state.error}
        </div>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmed" value="yes" required className="mt-1"/>
        <span>返送・検品実績と変更先ステータスを確認し、正式状態の更新に同意します。</span>
      </label>
      <PendingSubmitButton pendingLabel="ステータス同期中…">
        {B2B_RETURN_STATUS_LABEL[props.targetStatus]}に同期する
      </PendingSubmitButton>
    </form>
  );
}
