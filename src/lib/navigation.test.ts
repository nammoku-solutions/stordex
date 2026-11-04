import { describe, expect, it } from "vitest";
import { activeNavHref, NAV_ITEMS } from "./navigation";

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
    const matches = NAV_ITEMS.filter(item => activeNavHref("/orders/inbox") === item.href);
    expect(matches.map(item => item.label)).toEqual(["企業間受注トレイ"]);
    expect(activeNavHref(null)).toBeNull();
  });
});
