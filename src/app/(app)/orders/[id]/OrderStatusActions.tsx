"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@/generated/prisma/client";
import { setOrderStatus, deleteOrder } from "../actions";
import { ORDER_STATUS_LABEL } from "@/lib/format";
import { ORDER_TRANSITIONS } from "@/lib/order-transitions";

export function OrderStatusActions({
  orderId,
  status,
  linkedCompanyOrder = false,
}: {
  orderId: string;
  status: OrderStatus;
  linkedCompanyOrder?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const next = ORDER_TRANSITIONS[status].filter((state) =>
    !(linkedCompanyOrder && state === "CANCELLED")
  );
  const canDelete = !linkedCompanyOrder && (status === "DRAFT" || status === "CANCELLED");

  return (
    <div className="flex flex-wrap gap-2">
      {next.map((s) => (
        <button
          key={s}
          disabled={pending}
          className={s === "CANCELLED" ? "btn-danger" : "btn-primary"}
          onClick={() => {
            if (
              s === "CANCELLED" &&
              !window.confirm(status === "DRAFT"
                ? "この下書きを取り消しますか？（在庫は変わりません）"
                : "この注文を取消しますか？（引き当てた在庫が戻ります）")
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
