import Link from "next/link";
import { requireSession } from "@/lib/session";
import { SignOutButton } from "@/components/SignOutButton";
import { NavLink } from "@/components/NavLink";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const u = session.user;

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight">
            Stordex
          </Link>
          <div className="mt-1 text-xs text-slate-400 truncate">{u.tenantName}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1 text-sm overflow-y-auto">
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
          <div className="px-2 py-1 text-slate-300 truncate">{u.name || u.email}</div>
          <div className="px-2 pb-2 text-xs text-slate-500">{u.role}</div>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 bg-slate-50">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
