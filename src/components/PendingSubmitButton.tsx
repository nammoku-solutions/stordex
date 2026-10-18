"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Works with native Next.js server-action forms and their redirect/revalidation.
 * Use only INSIDE <form>; useFormStatus observes the nearest parent form.
 */
export function PendingSubmitButton({
  children,
  pendingLabel,
  className = "btn-primary",
  disabled = false,
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
      aria-disabled={disabled || pending}
    >
      <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
        {pending && (
          <span
            aria-hidden="true"
            className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        )}
        {pending ? pendingLabel : children}
      </span>
    </button>
  );
}
