"use client";

import { useFormStatus } from "react-dom";

/** Visual feedback for React server actions; disables repeat clicks. */
export function SubmitPendingButton({
  children,
  pendingText = "処理中…",
  className = "btn-primary",
  disabled = false,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? (
        <span className="inline-flex gap-2 items-center">
          <span className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" aria-hidden="true" />
          {pendingText}
        </span>
      ) : children}
    </button>
  );
}
