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
  canManageLinkedCancellation = false,
}: {
  orderId: string;
  status: OrderStatus;
  linkedCompanyOrder?: boolean;
  canManageLinkedCancellation?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const next = ORDER_TRANSITIONS[status].filter((state) =>
    !(linkedCompanyOrder && state === "CANCELLED" && !canManageLinkedCancellation)
  );
  const canDelete = !linkedCompanyOrder && (status === "DRAFT" || status === "CANCELLED");

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
              !window.confirm(linkedCompanyOrder
                ? (status === "DRAFT"
                  ? "発注元と出荷前の取消について合意済みですか？ 受注を取り消し、発注元が後から発注取消できる状態にします。在庫は変わりません。"
                  : "発注元と出荷前の取消について合意済みですか？ 受注を取り消し、在庫を戻します。発注元の発注取消は別途必要です。")
                : (status === "DRAFT"
                  ? "この下書きを取り消しますか？（在庫は変わりません）"
                  : "この注文を取消しますか？（引き当てた在庫が戻ります）"))
            ) {
              return;
            }
            start(async () => {
              await setOrderStatus(orderId, s);
              router.refresh();
            });
          }}
        >
          → {linkedCompanyOrder && s === "CANCELLED"
            ? "出荷前の取消に合意して受注を取消"
            : ORDER_STATUS_LABEL[s]}
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
