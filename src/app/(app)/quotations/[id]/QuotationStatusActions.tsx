"use client";

import { useState, useTransition } from "react";
import { ButtonPendingContent } from "@/components/ButtonPendingContent";
import { useRouter } from "next/navigation";
import type { QuotationStatus } from "@/generated/prisma/client";
import { setQuotationStatus, deleteQuotation } from "../actions";

const NEXT_LABEL: Record<QuotationStatus, string> = {
  DRAFT: "送付済にする",
  SENT: "受諾",
  ACCEPTED: "",
  REJECTED: "",
  EXPIRED: "",
};
const NEXT: Record<QuotationStatus, QuotationStatus | null> = {
  DRAFT: "SENT",
  SENT: "ACCEPTED",
  ACCEPTED: null,
  REJECTED: null,
  EXPIRED: null,
};

export function QuotationStatusActions({
  id,
  status,
}: {
  id: string;
  status: QuotationStatus;
}) {
  const [pending, start] = useTransition();
  const [activeAction, setActiveAction] = useState<string | null>(null);

  function runAction(key: string, work: () => Promise<void>) {
    if (pending) return;
    setActiveAction(key);
    start(async () => {
      try { await work(); } finally { setActiveAction(null); }
    });
  }
  const router = useRouter();
  const next = NEXT[status];

  return (
    <div className="flex flex-wrap gap-2">
      {next && (
        <button
          disabled={pending}
          className="btn-primary"
          onClick={() =>
            runAction(next, async () => {
              await setQuotationStatus(id, next);
              router.refresh();
            })
          }
        >
          <ButtonPendingContent pending={pending && activeAction === next}>
            → {NEXT_LABEL[status]}
          </ButtonPendingContent>
        </button>
      )}
      {(status === "DRAFT" || status === "SENT") && (
        <button
          disabled={pending}
          className="btn-danger"
          onClick={() => {
            if (!window.confirm("この見積を却下にしますか？")) return;
            runAction("REJECTED", async () => {
              await setQuotationStatus(id, "REJECTED");
              router.refresh();
            });
          }}
        >
          <ButtonPendingContent pending={pending && activeAction === "REJECTED"}>却下</ButtonPendingContent>
        </button>
      )}
      <button
        disabled={pending}
        className="btn-secondary"
        onClick={() => {
          if (!window.confirm("この見積書を削除しますか？")) return;
          runAction("DELETE", async () => {
            await deleteQuotation(id);
            router.push("/quotations");
          });
        }}
      >
        <ButtonPendingContent pending={pending && activeAction === "DELETE"}>削除</ButtonPendingContent>
      </button>
    </div>
  );
}
