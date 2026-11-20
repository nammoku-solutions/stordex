/** Keep everyday work directly accessible; grouping never changes route permissions. */
const DAILY_NAV_ITEMS = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/orders", label: "受注管理" },
  { href: "/orders/inbox", label: "企業間受注トレイ" },
  { href: "/purchase-orders", label: "仕入先発注" },
  { href: "/inventory", label: "在庫管理" },
  { href: "/invoices", label: "請求書" },
] as const;

const RETURN_NAV_ITEM = { href: "/returns", label: "企業間返品" } as const;

export function dailyNavItems(returnsEnabled: boolean) {
  return returnsEnabled ? [...DAILY_NAV_ITEMS, RETURN_NAV_ITEM] : DAILY_NAV_ITEMS;
}

export const SECONDARY_NAV_GROUPS = [
  {
    label: "商品・取引先",
    items: [
      { href: "/items", label: "商品マスタ" },
      { href: "/customers", label: "得意先" },
      { href: "/suppliers", label: "仕入先" },
      { href: "/network", label: "企業間取引" },
    ],
  },
  {
    label: "見積・売上集計",
    items: [
      { href: "/quotations", label: "見積書" },
      { href: "/reports/products", label: "商品別売上" },
    ],
  },
  {
    label: "設定・CSV",
    items: [
      { href: "/settings/business-units", label: "事業所設定" },
      { href: "/settings/import", label: "CSV 取り込み" },
      { href: "/settings/export", label: "CSV エクスポート" },
      { href: "/settings/legacy-import", label: "旧データ取り込み" },
    ],
  },
] as const;

const NAV_ITEMS = [...dailyNavItems(true), ...SECONDARY_NAV_GROUPS.flatMap(group => [...group.items])];

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
