import { describe, expect, it } from "vitest";
import { activeNavHref, dailyNavItems, SECONDARY_NAV_GROUPS } from "./navigation";

const existingDestinations = [
  "/dashboard", "/orders", "/orders/inbox", "/quotations", "/purchase-orders",
  "/network", "/invoices", "/customers", "/items", "/inventory", "/suppliers",
  "/reports/products", "/settings/business-units", "/settings/legacy-import",
  "/settings/import", "/settings/export",
];

describe("workflow-first sidebar", () => {
  it("keeps the six daily destinations one click away", () => {
    expect(dailyNavItems(false).map(item => item.href)).toEqual([
      "/dashboard", "/orders", "/orders/inbox", "/purchase-orders", "/inventory", "/invoices",
    ]);
  });

  it("retains every previous destination exactly once and only adds returns when enabled", () => {
    const secondary = SECONDARY_NAV_GROUPS.flatMap(group => group.items.map(item => item.href));
    const ordinary = [...dailyNavItems(false).map(item => item.href), ...secondary];
    expect([...ordinary].sort()).toEqual([...existingDestinations].sort());
    expect(dailyNavItems(true).filter(item => item.href === "/returns")).toHaveLength(1);
  });

  it("matches a deep link to the right expandable group", () => {
    const groupFor = (pathname: string) => SECONDARY_NAV_GROUPS.find(group =>
      group.items.some(item => item.href === activeNavHref(pathname)),
    )?.label;
    expect(groupFor("/settings/import/purchase-orders")).toBe("設定・CSV");
    expect(groupFor("/items/new")).toBe("商品・取引先");
    expect(groupFor("/reports/products")).toBe("見積・売上集計");
    expect(groupFor("/orders/inbox/received")).toBeUndefined();
    expect(activeNavHref("/returns/R-001")).toBe("/returns");
  });
});

describe("sidebar active route matching", () => {
  it("highlights the enterprise inbox without simultaneously selecting orders", () => {
    expect(activeNavHref("/orders/inbox")).toBe("/orders/inbox");
    expect(activeNavHref("/orders/inbox/received")).toBe("/orders/inbox");
  });

  it("keeps ordinary sales-order routes on their own parent nav", () => {
    expect(activeNavHref("/orders")).toBe("/orders");
    expect(activeNavHref("/orders/new")).toBe("/orders");
    expect(activeNavHref("/orders/order-id")).toBe("/orders");
  });

  it("only matches complete URL segments", () => {
    expect(activeNavHref("/orders-inbox")).toBeNull();
    expect(activeNavHref("/ordersx")).toBeNull();
    expect(activeNavHref("/settings/imported")).toBeNull();
    expect(activeNavHref("/inventory/history")).toBe("/inventory");
  });

  it("returns the deepest route regardless of ordering and never selects two", () => {
    expect(activeNavHref("/a/b/c", [
      { href: "/a/b" }, { href: "/a" }, { href: "/a/b/c" },
    ])).toBe("/a/b/c");
    const matches = dailyNavItems(false).filter(item => activeNavHref("/orders/inbox") === item.href);
    expect(matches.map(item => item.label)).toEqual(["企業間受注トレイ"]);
    expect(activeNavHref(null)).toBeNull();
  });
});
