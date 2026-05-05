"use client";

import { useFormStatus } from "react-dom";
import clsx from "clsx";

type Variant = "primary" | "danger" | "secondary";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "btn-primary",
  danger: "btn-danger",
  secondary: "btn-secondary",
};

/**
 * Submit button that shows a pending state while a parent <form action={...}>
 * is being submitted. Use inside a form to give users feedback that their
 * click was registered.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel?: React.ReactNode;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={clsx(VARIANT_CLASS[variant], className)}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
          />
          {pendingLabel ?? "処理中..."}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
