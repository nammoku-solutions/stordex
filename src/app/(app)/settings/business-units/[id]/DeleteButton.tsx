"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBusinessUnit } from "../actions";

export function DeleteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      className="btn-danger"
      onClick={() => {
        if (!window.confirm("削除しますか？")) return;
        start(async () => {
          await deleteBusinessUnit(id);
          router.push("/settings/business-units");
        });
      }}
    >
      削除
    </button>
  );
}
