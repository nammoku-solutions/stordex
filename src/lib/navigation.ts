/** Sidebar navigation order and exact route roots; shared with active-state matching. */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/orders", label: "受注管理" },
  { href: "/orders/inbox", label: "企業間受注トレイ" },
  { href: "/quotations", label: "見積書" },
  { href: "/purchase-orders", label: "仕入先発注" },
  { href: "/network", label: "企業間取引" },
  { href: "/invoices", label: "請求書" },
  { href: "/customers", label: "得意先" },
  { href: "/items", label: "商品マスタ" },
  { href: "/inventory", label: "在庫管理" },
  { href: "/suppliers", label: "仕入先" },
  { href: "/reports/products", label: "商品別売上" },
  { href: "/settings/business-units", label: "事業所設定" },
  { href: "/settings/legacy-import", label: "旧データ取り込み" },
  { href: "/settings/import", label: "CSV 取り込み" },
  { href: "/settings/export", label: "CSV エクスポート" },
] as const;

/**
 * A nested route should highlight the most specific sidebar item only.
 * '/orders/inbox' belongs to its own nav item, not both '/orders' and '/orders/inbox'.
 * Check segment boundaries: '/orders-copy' must never select '/orders'.
 */
export function activeNavHref(
  pathname: string | null,
  items: readonly { readonly href: string }[] = NAV_ITEMS,
): string | null {
  if (!pathname) return null;
  let selected: string | null = null;
  for (const { href } of items) {
    if (pathname === href || pathname.startsWith(href + "/")) {
      if (!selected || href.length > selected.length) selected = href;
    }
  }
  return selected;
}
