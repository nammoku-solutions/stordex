import type { ReactNode } from "react";

/** Shared visual language for all in-flight server actions and client transitions. */
export function ButtonPendingContent({
  pending,
  children,
  pendingText = "処理中…",
}: {
  pending: boolean;
  children: ReactNode;
  pendingText?: string;
}) {
  return pending ? (
    <span className="inline-flex items-center justify-center gap-2" role="status" aria-live="polite">
      <span
        aria-hidden="true"
        className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
      />
      {pendingText}
    </span>
  ) : <>{children}</>;
}
