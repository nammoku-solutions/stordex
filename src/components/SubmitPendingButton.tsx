"use client";

import { useFormStatus } from "react-dom";
import { ButtonPendingContent } from "./ButtonPendingContent";

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
      <ButtonPendingContent pending={pending} pendingText={pendingText}>
        {children}
      </ButtonPendingContent>
    </button>
  );
}
