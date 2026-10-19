"use client";

import { useFormStatus } from "react-dom";
import { ButtonPendingContent } from "./ButtonPendingContent";

/** Visual feedback for React server actions; disables repeat clicks. */
export function SubmitPendingButton({
  children,
  pendingText = "処理中…",
  className = "btn-primary",
  disabled = false,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  const active = pending && (!name || data?.get(name) === value);
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-busy={active}
      name={name}
      value={value}
    >
      <ButtonPendingContent pending={active} pendingText={pendingText}>
        {children}
      </ButtonPendingContent>
    </button>
  );
}
