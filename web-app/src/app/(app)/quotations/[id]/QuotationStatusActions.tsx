"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuotationStatus } from "@prisma/client";
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
  const router = useRouter();
  const next = NEXT[status];

  return (
    <div className="flex flex-wrap gap-2">
      {next && (
        <button
          disabled={pending}
          className="btn-primary"
          onClick={() =>
            start(async () => {
              await setQuotationStatus(id, next);
              router.refresh();
            })
          }
        >
          → {NEXT_LABEL[status]}
        </button>
      )}
      {(status === "DRAFT" || status === "SENT") && (
        <button
          disabled={pending}
          className="btn-danger"
          onClick={() => {
            if (!window.confirm("この見積を却下にしますか？")) return;
            start(async () => {
              await setQuotationStatus(id, "REJECTED");
              router.refresh();
            });
          }}
        >
          却下
        </button>
      )}
      <button
        disabled={pending}
        className="btn-secondary"
        onClick={() => {
          if (!window.confirm("この見積書を削除しますか？")) return;
          start(async () => {
            await deleteQuotation(id);
            router.push("/quotations");
          });
        }}
      >
        削除
      </button>
    </div>
  );
}
