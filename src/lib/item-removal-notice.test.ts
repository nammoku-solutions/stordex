import { describe, expect, it } from "vitest";
import { getItemRemovalNotice } from "./item-removal-notice";

describe("product removal UI feedback", () => {
  it("presents unfinished transactions as an actionable accessible error", () => {
    const notice = getItemRemovalNotice("open-transactions");
    expect(notice).toMatchObject({
      tone: "error",
      title: "商品を削除できません",
    });
    expect(notice?.message).toContain("未完了");
    expect(notice?.links?.map(link => link.href)).toEqual([
      "/orders", "/purchase-orders", "/quotations",
    ]);
  });

  it("never suggests inventing stock movements to delete a product", () => {
    const notice = getItemRemovalNotice("stock-remains");
    expect(notice?.tone).toBe("error");
    expect(notice?.message).toContain("削除のためだけに");
    expect(notice?.links?.[0].href).toBe("/inventory");
  });

  it("separates removal/retirement success from blocked outcomes", () => {
    for (const code of ["removed", "retired", "reactivated"]) {
      expect(getItemRemovalNotice(code)?.tone).toBe("success");
    }
    for (const code of ["open-transactions", "stock-remains", "concurrent-change", "not-found"]) {
      expect(getItemRemovalNotice(code)?.tone).toBe("error");
    }
    expect(getItemRemovalNotice("already-retired")?.tone).toBe("info");
  });

  it("ignores unknown status codes (no user-controlled alert content)", () => {
    expect(getItemRemovalNotice(undefined)).toBeNull();
    expect(getItemRemovalNotice("<script>alert(1)</script>")).toBeNull();
    expect(getItemRemovalNotice("toString")).toBeNull();
    expect(getItemRemovalNotice("__proto__")).toBeNull();
  });
});
