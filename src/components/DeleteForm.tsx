"use client";

import { useFormStatus } from "react-dom";

function DeleteSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="text-red-600 hover:underline text-sm disabled:opacity-50"
    >
      {pending ? "削除中..." : label}
    </button>
  );
}

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
      <DeleteSubmit label={label} />
    </form>
  );
}
