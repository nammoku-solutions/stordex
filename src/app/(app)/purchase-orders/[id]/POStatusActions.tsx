"use client";

import { useState, useTransition } from "react";
import { ButtonPendingContent } from "@/components/ButtonPendingContent";
import { useRouter } from "next/navigation";
import type { PurchaseOrderStatus } from "@/generated/prisma/client";
import { setPurchaseOrderStatus, deletePurchaseOrder } from "../actions";

export function POStatusActions({
  id,
  status,
  linkedStatus,
  sellerOrderStatus,
  canManageLinkedCancellation = false,
}: {
  id: string;
  status: PurchaseOrderStatus;
  linkedStatus?: "SENT" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  sellerOrderStatus?: "DRAFT" | "CONFIRMED" | "SHIPPED" | "COMPLETED" | "CANCELLED";
  canManageLinkedCancellation?: boolean;
}) {
  const [pending, start] = useTransition();
  const [activeAction, setActiveAction] = useState<string | null>(null);
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
        <button
          disabled={pending}
          className="btn-primary"
          onClick={() => advance("RECEIVED", "入荷確定すると在庫に自動加算されます。よろしいですか？")}
        >
          <ButtonPendingContent pending={pending && activeAction === "RECEIVED"}>→ 入荷確定（在庫加算）</ButtonPendingContent>
        </button>
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
