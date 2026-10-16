"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PurchaseOrderStatus } from "@/generated/prisma/client";
import { setPurchaseOrderStatus, deletePurchaseOrder } from "../actions";

export function POStatusActions({
  id,
  status,
}: {
  id: string;
  status: PurchaseOrderStatus;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const advance = async (next: PurchaseOrderStatus, msg?: string) => {
    if (msg && !window.confirm(msg)) return;
    start(async () => {
      await setPurchaseOrderStatus(id, next);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      {status === "DRAFT" && (
        <button disabled={pending} className="btn-primary" onClick={() => advance("ORDERED")}>
          → 発注済にする
        </button>
      )}
      {status === "ORDERED" && (
        <button
          disabled={pending}
          className="btn-primary"
          onClick={() => advance("RECEIVED", "入荷確定すると在庫に自動加算されます。よろしいですか？")}
        >
          → 入荷確定（在庫加算）
        </button>
      )}
      {(status === "DRAFT" || status === "ORDERED") && (
        <button
          disabled={pending}
          className="btn-danger"
          onClick={() => advance("CANCELLED", "発注を取消にしますか？")}
        >
          取消
        </button>
      )}
      {pending && <span className="text-sm text-slate-600" role="status">処理中…</span>}
      {status !== "RECEIVED" && (
        <button
          disabled={pending}
          className="btn-secondary"
          onClick={() => {
            if (!window.confirm("削除しますか？")) return;
            start(async () => {
              await deletePurchaseOrder(id);
              router.push("/purchase-orders");
            });
          }}
        >
          削除
        </button>
      )}
    </div>
  );
}
