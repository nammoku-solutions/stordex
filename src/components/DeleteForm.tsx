"use client";

import { SubmitPendingButton } from "@/components/SubmitPendingButton";

export function DeleteForm({
  id,
  action,
  confirm,
  label = "削除",
}: {
  id: string;
  action: (id: string) => Promise<void>;
  confirm: string;
  label?: string;
}) {
  return (
    <form
      action={async () => {
        await action(id);
      }}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) {
          e.preventDefault();
        }
      }}
      className="inline"
    >
      <SubmitPendingButton className="text-red-600 hover:underline text-sm" pendingText="削除中…">
        {label}
      </SubmitPendingButton>
    </form>
  );
}
