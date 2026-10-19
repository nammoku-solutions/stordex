"use client";

import type { ReactNode } from "react";
import { SubmitPendingButton } from "./SubmitPendingButton";

/** Backwards-compatible prop names for the enterprise send/accept forms. */
export function PendingSubmitButton({
  children,
  pendingLabel,
  className = "btn-primary",
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <SubmitPendingButton pendingText={pendingLabel} className={className} disabled={disabled}>
      {children}
    </SubmitPendingButton>
  );
}
