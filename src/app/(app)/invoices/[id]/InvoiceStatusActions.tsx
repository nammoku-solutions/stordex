"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InvoiceStatus } from "@/generated/prisma/client";
import { setInvoiceStatus, deleteInvoice } from "../actions";

export function InvoiceStatusActions({
  id,
  status,
}: {
  id: string;
  status: InvoiceStatus;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const advance = (next: InvoiceStatus, msg?: string) => {
    if (msg && !window.confirm(msg)) return;
    start(async () => {
      await setInvoiceStatus(id, next);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && (
        <button disabled={pending} className="btn-primary" onClick={() => advance("ISSUED")}>
          → 発行済
        </button>
      )}
      {status === "ISSUED" && (
        <button disabled={pending} className="btn-primary" onClick={() => advance("PAID")}>
          → 入金済
        </button>
      )}
      {(status === "DRAFT" || status === "ISSUED") && (
        <button
          disabled={pending}
          className="btn-danger"
          onClick={() => advance("CANCELLED", "請求書を無効化しますか？")}
        >
          無効化
        </button>
      )}
      <button
        disabled={pending}
        className="btn-secondary"
        onClick={() => {
          if (!window.confirm("この請求書を削除しますか？")) return;
          start(async () => {
            await deleteInvoice(id);
            router.push("/invoices");
          });
        }}
      >
        削除
      </button>
    </div>
  );
}
