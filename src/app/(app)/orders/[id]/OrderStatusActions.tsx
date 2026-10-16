"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@/generated/prisma/client";
import { setOrderStatus, deleteOrder } from "../actions";
import { ORDER_STATUS_LABEL } from "@/lib/format";

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function OrderStatusActions({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const next = TRANSITIONS[status];
  const canDelete = status === "DRAFT" || status === "CANCELLED";

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      {next.map((s) => (
        <button
          key={s}
          disabled={pending}
          className={s === "CANCELLED" ? "btn-danger" : "btn-primary"}
          onClick={() => {
            if (
              s === "CANCELLED" &&
              !window.confirm("この注文を取消しますか？（在庫が戻ります）")
            ) {
              return;
            }
            start(async () => {
              await setOrderStatus(orderId, s);
              router.refresh();
            });
          }}
        >
          → {ORDER_STATUS_LABEL[s]}
        </button>
      ))}
      {pending && <span className="text-sm text-slate-600" role="status">処理中…</span>}
      {canDelete && (
        <button
          disabled={pending}
          className="btn-secondary"
          onClick={() => {
            if (!window.confirm("この注文を削除しますか？")) return;
            start(async () => {
              await deleteOrder(orderId);
              router.push("/orders");
            });
          }}
        >
          削除
        </button>
      )}
    </div>
  );
}
