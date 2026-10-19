"use client";

import { useState, useTransition } from "react";
import { ButtonPendingContent } from "@/components/ButtonPendingContent";
import { useRouter } from "next/navigation";
import type { PurchaseOrderStatus } from "@/generated/prisma/client";
import { setPurchaseOrderStatus, deletePurchaseOrder, confirmCountedPurchaseReceipt } from "../actions";
import { SubmitPendingButton } from "@/components/SubmitPendingButton";

export function POStatusActions({
  id,
  status,
  linkedStatus,
  sellerOrderStatus,
  canManageLinkedCancellation = false,
  receiptLines = [],
}: {
  id: string;
  status: PurchaseOrderStatus;
  linkedStatus?: "SENT" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  sellerOrderStatus?: "DRAFT" | "CONFIRMED" | "SHIPPED" | "COMPLETED" | "CANCELLED";
  canManageLinkedCancellation?: boolean;
  receiptLines?: { id: string; itemName: string; quantity: number; received: number; unit: string }[];
}) {
  const [pending, start] = useTransition();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [countedReceipts, setCountedReceipts] = useState<Record<string, number>>({});
  const hasCountDifference = receiptLines.some(line =>
    (countedReceipts[line.id] ?? line.quantity) !== line.quantity
  );
  const router = useRouter();
  const linkedCannotCancel = linkedStatus === "ACCEPTED" && sellerOrderStatus !== "CANCELLED";
  const canCancel = (status === "DRAFT" || status === "ORDERED") &&
    !linkedCannotCancel && (!linkedStatus || canManageLinkedCancellation);

  const advance = async (next: PurchaseOrderStatus, msg?: string) => {
    if (msg && !window.confirm(msg)) return;
    if (pending) return;
    setActiveAction(next);
    start(async () => {
      try {
        await setPurchaseOrderStatus(id, next);
        router.refresh();
      } finally {
        setActiveAction(null);
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      {status === "DRAFT" && (
        <button disabled={pending} className="btn-primary" onClick={() => advance("ORDERED")}>
          <ButtonPendingContent pending={pending && activeAction === "ORDERED"}>→ 発注済にする</ButtonPendingContent>
        </button>
      )}
      {status === "ORDERED" && (
        <div className="w-full card p-4 space-y-3">
          <h2 className="font-semibold">現品検数・入荷確定</h2>
          {linkedStatus && (linkedStatus !== "ACCEPTED" ||
              !["SHIPPED", "COMPLETED"].includes(sellerOrderStatus || "")) ? (
            <p className="text-sm text-amber-800">
              企業間発注は相手企業が出荷した後に入荷確定できます。
            </p>
          ) : (
            <form action={confirmCountedPurchaseReceipt.bind(null, id)}
              className="space-y-3"
              onSubmit={(e) => {
                if (!window.confirm("現物を数えましたか？ 入荷確定後は在庫と入庫履歴が更新されます。発注数量と実入荷数に差がある場合、差異の理由を記録してください。")) {
                  e.preventDefault();
                }
              }}>
              <p className="text-sm text-slate-600">
                実入荷数を現品に合わせて入力してください。発注数量が初期入力されています。
                例：発注9個、実入荷10個なら「10」と入力します。
              </p>
              <div className="space-y-2">
                {receiptLines.map(line => (
                  <label key={line.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-36">{line.itemName}</span>
                    <span className="text-slate-500">発注 {line.quantity} {line.unit}</span>
                    <span className="text-slate-500">実入荷：</span>
                    <input type="number" name={`received_${line.id}`}
                      min={line.received} max={100000000} step={1}
                      value={countedReceipts[line.id] ?? line.quantity}
                      onChange={(e) => setCountedReceipts(prev => ({
                        ...prev, [line.id]: Number(e.target.value),
                      }))}
                      required className="input w-28" />
                    <span>{line.unit}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="label">入荷差異の理由（発注数と実数が異なる場合は必須）</label>
                <textarea name="discrepancyReason" maxLength={500} rows={2}
                  required={hasCountDifference}
                  className="input" placeholder="例：仕入先から1個多く納品された。数量を確認済み" />
                {hasCountDifference && (
                  <p className="text-xs text-amber-800 mt-1" role="status">
                    発注数量と実入荷数量に差があります。差異理由を入力してください。
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-1">
                  差異は元の発注数量や金額を自動修正せず、実入荷数を在庫・履歴へ反映して記録します。
                  請求金額の調整は別途確認してください。
                </p>
              </div>
              <SubmitPendingButton pendingText="実入荷数を確定中…" disabled={pending || receiptLines.length === 0}>
                → 入荷確定（検数した数量で在庫加算）
              </SubmitPendingButton>
            </form>
          )}
        </div>
      )}
      {canCancel && (
        <button
          disabled={pending}
          className="btn-danger"
          onClick={() => advance("CANCELLED", sellerOrderStatus === "CANCELLED"
            ? "先方の受注は取消済みです。この発注も取り消しますか？（入庫済み在庫はありません）"
            : "発注を取消にしますか？")}
        >
          <ButtonPendingContent pending={pending && activeAction === "CANCELLED"}>取消</ButtonPendingContent>
        </button>
      )}
      {linkedCannotCancel && status === "ORDERED" && (
        <p className="w-full text-sm text-amber-800">
          受注先が承認済みです。出荷前の取消は相手企業と合意し、先方が受注を取り消してから操作してください。
          出荷後の返品はこの操作では処理できません。
        </p>
      )}
      {status !== "RECEIVED" && !linkedStatus && (
        <button
          disabled={pending}
          className="btn-secondary"
          onClick={() => {
            if (!window.confirm("削除しますか？")) return;
            if (pending) return;
            setActiveAction("DELETE");
            start(async () => {
              try {
                await deletePurchaseOrder(id);
                router.push("/purchase-orders");
              } finally {
                setActiveAction(null);
              }
            });
          }}
        >
          <ButtonPendingContent pending={pending && activeAction === "DELETE"}>削除</ButtonPendingContent>
        </button>
      )}
    </div>
  );
}
