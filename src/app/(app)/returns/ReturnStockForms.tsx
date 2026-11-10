"use client";

import { useActionState } from "react";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import {
  dispatchB2BReturnForm, inspectB2BReturnForm,
} from "./stock-actions";

type Common = {
  requestId: string;
  returnItemId: string;
  eventId: string;
  itemName: string;
  unit: string;
};

export function BuyerReturnDispatchForm({
  requestId, returnItemId, eventId, itemName, unit, remainingApproved,
}: Common & { remainingApproved: number }) {
  const [state, action] = useActionState(dispatchB2BReturnForm, { error: null });
  return (
    <form action={action} className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-4">
      <h3 className="font-semibold">返品商品の返送を確定</h3>
      <p className="text-sm text-slate-700">
        {itemName}：未返送の承認数量 {remainingApproved} {unit}
      </p>
      <input type="hidden" name="requestId" value={requestId}/>
      <input type="hidden" name="returnItemId" value={returnItemId}/>
      <input type="hidden" name="eventId" value={eventId}/>
      <label className="block text-sm font-medium" htmlFor={`dispatch-${returnItemId}`}>
        今回返送する数量
      </label>
      <input id={`dispatch-${returnItemId}`} className="input max-w-40"
        type="number" name="quantity" min={1} max={remainingApproved} step={1}
        defaultValue={remainingApproved} required/>
      <p className="text-sm text-amber-900">
        確定すると買い手の現在庫が返送数量分だけ減り、返品出庫履歴が記録されます。
        承認済み数量を超える返送や、同じ操作の二重処理は拒否されます。
      </p>
      {state.error && <div role="alert" className="border border-red-300 bg-red-50 p-3 text-red-800 rounded">{state.error}</div>}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmed" value="yes" required className="mt-1"/>
        <span>現品の返送数量を確認しました。買い手在庫が減ることに同意します。</span>
      </label>
      <PendingSubmitButton pendingLabel="返送を確定中…">返送・出庫を確定する</PendingSubmitButton>
    </form>
  );
}

export function SellerReturnInspectionForm({
  requestId, returnItemId, eventId, itemName, unit, availableToInspect,
}: Common & { availableToInspect: number }) {
  const [state, action] = useActionState(inspectB2BReturnForm, { error: null });
  return (
    <form action={action} className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <h3 className="font-semibold">返送品の受領・検品結果を確定</h3>
      <p className="text-sm text-slate-700">
        {itemName}：返送済みで未検品 {availableToInspect} {unit}
      </p>
      <input type="hidden" name="requestId" value={requestId}/>
      <input type="hidden" name="returnItemId" value={returnItemId}/>
      <input type="hidden" name="eventId" value={eventId}/>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block text-sm font-medium">
          <span className="block mb-1">今回受領・検品する数量</span>
          <input className="input w-full" type="number" name="receivedNow"
            min={1} max={availableToInspect} step={1} defaultValue={availableToInspect} required/>
        </label>
        <label className="block text-sm font-medium">
          <span className="block mb-1">良品数（在庫へ戻す）</span>
          <input className="input w-full" type="number" name="saleable"
            min={0} max={availableToInspect} step={1} defaultValue={availableToInspect} required/>
        </label>
        <label className="block text-sm font-medium">
          <span className="block mb-1">不良品数（在庫へ戻さない）</span>
          <input className="input w-full" type="number" name="unsaleable"
            min={0} max={availableToInspect} step={1} defaultValue={0} required/>
        </label>
      </div>
      <p className="text-sm text-amber-900">
        「良品数 + 不良品数 = 今回受領数」にしてください。
        確定すると売り手の通常在庫には良品だけが入庫されます。
        不良品は検品履歴に記録し、通常在庫へ加算しません。
        この操作は返金・請求調整を行いません。
      </p>
      {state.error && <div role="alert" className="border border-red-300 bg-red-50 p-3 text-red-800 rounded">{state.error}</div>}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmed" value="yes" required className="mt-1"/>
        <span>現品を検品し、良品・不良品の数量が正しいことを確認しました。</span>
      </label>
      <PendingSubmitButton pendingLabel="検品・入庫を確定中…">検品結果と良品入庫を確定する</PendingSubmitButton>
    </form>
  );
}
