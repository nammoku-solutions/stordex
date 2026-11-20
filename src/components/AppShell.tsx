"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { NavLink } from "@/components/NavLink";
import { activeNavHref, dailyNavItems, SECONDARY_NAV_GROUPS } from "@/lib/navigation";
import { SignOutButton } from "@/components/SignOutButton";

type UserInfo = {
  name?: string | null;
  email: string;
  role: string;
  tenantName: string;
};

function SidebarContent({
  user,
  currentHref,
  returnsEnabled,
  onNavigate,
  onClose,
  closeButtonRef,
}: {
  user: UserInfo;
  currentHref: string | null;
  returnsEnabled: boolean;
  onNavigate?: () => void;
  onClose?: () => void;
  closeButtonRef?: React.Ref<HTMLButtonElement>;
}) {
  const renderNavLink = (item: { href: string; label: string }) => (
    <NavLink
      key={item.href}
      href={item.href}
      label={item.label}
      active={currentHref === item.href}
      onNavigate={onNavigate}
    />
  );

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex items-start justify-between gap-2 px-5 py-5 border-b border-slate-800">
        <div className="min-w-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-2"
            onClick={onNavigate}
          >
            <Image src="/logo.svg" alt="Stordex" width={28} height={28} />
            <span className="text-xl font-bold tracking-tight">Stordex</span>
          </Link>
          <div className="mt-1 text-xs text-slate-400 truncate">
            {user.tenantName}
          </div>
        </div>
        {onClose && (
          <button ref={closeButtonRef} type="button" onClick={onClose}
            className="min-h-11 shrink-0 rounded-md px-2 text-sm text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-300">
            閉じる
          </button>
        )}
      </div>
      <nav
        aria-label="メインメニュー"
        className="flex-1 p-3 text-sm overflow-y-auto"
      >
        <div className="space-y-1">{dailyNavItems(returnsEnabled).map(renderNavLink)}</div>
        <div className="mt-3 space-y-1 border-t border-slate-700 pt-3">
          {SECONDARY_NAV_GROUPS.map(group => {
            const selected = group.items.some(item => item.href === currentHref);
            return (
              <details key={group.label} open={selected} className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-300 [&::-webkit-details-marker]:hidden">
                  <span>{group.label}</span>
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 group-open:rotate-180">
                    <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <div className="ml-3 border-l border-slate-700 pl-2">
                  {group.items.map(renderNavLink)}
                </div>
              </details>
            );
          })}
        </div>
      </nav>
      <div className="p-3 border-t border-slate-800 text-sm">
        <div className="px-2 py-1 text-slate-300 truncate">
          {user.name || user.email}
        </div>
        <div className="px-2 pb-2 text-xs text-slate-500">{user.role}</div>
        <SignOutButton />
      </div>
    </div>
  );
}

export function AppShell({
  user,
  children,
  returnsEnabled,
}: {
  user: UserInfo;
  children: React.ReactNode;
  returnsEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const currentHref = activeNavHref(pathname);
  const dismissMenu = () => {
    setOpen(false);
    openerRef.current?.focus();
  };

  // Close drawer when route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        openerRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="min-h-screen md:flex">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-slate-900 text-slate-100 px-4 h-14 border-b border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Stordex" width={24} height={24} />
          <span className="text-lg font-bold tracking-tight">Stordex</span>
        </Link>
        <button
          type="button"
          ref={openerRef}
          aria-label={open ? "メニューを閉じる" : "メニューを開く"}
          aria-expanded={open}
          aria-controls="mobile-app-menu"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center justify-center w-10 h-10 rounded-md hover:bg-slate-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {open ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:shrink-0">
        <SidebarContent user={user} currentHref={currentHref} returnsEnabled={returnsEnabled} />
      </aside>

      {/* Mobile drawer */}
      <div
        id="mobile-app-menu"
        className={clsx(
          "md:hidden fixed inset-0 z-40 transition-opacity",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        aria-hidden={!open}
        inert={!open}
      >
        <div
          className="absolute inset-0 bg-black/50"
          onClick={dismissMenu}
        />
        <div
          className={clsx(
            "absolute inset-y-0 left-0 w-72 max-w-[80%] shadow-xl transition-transform",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <SidebarContent user={user} currentHref={currentHref} returnsEnabled={returnsEnabled}
            onNavigate={dismissMenu} onClose={dismissMenu} closeButtonRef={closeButtonRef} />
        </div>
      </div>

      <main className="flex-1 min-w-0 bg-slate-50">
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
