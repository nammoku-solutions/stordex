"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { NavLink } from "@/components/NavLink";
import { SignOutButton } from "@/components/SignOutButton";

type UserInfo = {
  name?: string | null;
  email: string;
  role: string;
  tenantName: string;
};

function SidebarContent({
  user,
  onNavigate,
}: {
  user: UserInfo;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="px-5 py-5 border-b border-slate-800">
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
      <nav
        className="flex-1 p-3 space-y-1 text-sm overflow-y-auto"
        onClick={onNavigate}
      >
        <NavLink href="/dashboard" label="ダッシュボード" />
        <NavLink href="/orders" label="受注管理" />
        <NavLink href="/quotations" label="見積書" />
        <NavLink href="/purchase-orders" label="仕入先発注" />
        <NavLink href="/invoices" label="請求書" />
        <NavLink href="/customers" label="得意先" />
        <NavLink href="/items" label="商品マスタ" />
        <NavLink href="/inventory" label="在庫管理" />
        <NavLink href="/suppliers" label="仕入先" />
        <NavLink href="/reports/products" label="商品別売上" />
        <NavLink href="/settings/business-units" label="事業所設定" />
        <NavLink href="/settings/legacy-import" label="旧データ取り込み" />
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
}: {
  user: UserInfo;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer when route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
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
          aria-label="メニューを開く"
          aria-expanded={open}
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
        <SidebarContent user={user} />
      </aside>

      {/* Mobile drawer */}
      <div
        className={clsx(
          "md:hidden fixed inset-0 z-40 transition-opacity",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => setOpen(false)}
        />
        <div
          className={clsx(
            "absolute inset-y-0 left-0 w-72 max-w-[80%] shadow-xl transition-transform",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <SidebarContent user={user} onNavigate={() => setOpen(false)} />
        </div>
      </div>

      <main className="flex-1 min-w-0 bg-slate-50">
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
