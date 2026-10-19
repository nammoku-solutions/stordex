"use client";

import { useState, useTransition } from "react";
import { ButtonPendingContent } from "@/components/ButtonPendingContent";
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
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const router = useRouter();

  const advance = (next: InvoiceStatus, msg?: string) => {
    if (msg && !window.confirm(msg)) return;
    if (pending) return;
    setActiveAction(next);
    start(async () => {
      try {
        await setInvoiceStatus(id, next);
        router.refresh();
      } finally {
        setActiveAction(null);
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && (
        <button disabled={pending} className="btn-primary" onClick={() => advance("ISSUED")}>
          <ButtonPendingContent pending={pending && activeAction === "ISSUED"}>→ 発行済</ButtonPendingContent>
        </button>
      )}
      {status === "ISSUED" && (
        <button disabled={pending} className="btn-primary" onClick={() => advance("PAID")}>
          <ButtonPendingContent pending={pending && activeAction === "PAID"}>→ 入金済</ButtonPendingContent>
        </button>
      )}
      {(status === "DRAFT" || status === "ISSUED") && (
        <button
          disabled={pending}
          className="btn-danger"
          onClick={() => advance("CANCELLED", "請求書を無効化しますか？")}
        >
          <ButtonPendingContent pending={pending && activeAction === "CANCELLED"}>無効化</ButtonPendingContent>
        </button>
      )}
      <button
        disabled={pending}
        className="btn-secondary"
        onClick={() => {
          if (!window.confirm("この請求書を削除しますか？")) return;
          if (pending) return;
          setActiveAction("DELETE");
          start(async () => {
            try {
              await deleteInvoice(id);
              router.push("/invoices");
            } finally {
              setActiveAction(null);
            }
          });
        }}
      >
        <ButtonPendingContent pending={pending && activeAction === "DELETE"}>削除</ButtonPendingContent>
      </button>
    </div>
  );
}
