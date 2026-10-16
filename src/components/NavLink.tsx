"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

function LinkPendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span className="ml-auto text-xs text-slate-200 inline-flex items-center gap-1" aria-live="polite">
      <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
      読込中
    </span>
  ) : null;
}

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-2 px-3 py-2 rounded-md transition",
        active
          ? "bg-brand-600 text-white"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      )}
    >
      <span>{label}</span>
      <LinkPendingIndicator />
    </Link>
  );
}
