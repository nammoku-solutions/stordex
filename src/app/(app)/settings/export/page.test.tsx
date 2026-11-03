import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ requireTenant: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireTenant: mocks.requireTenant }));
vi.mock("@/components/PageHeader", () => ({ PageHeader: () => null }));

import ExportPage from "./page";

describe("CSV export -> purchase-order preflight navigation", () => {
  it("clearly distinguishes supplier purchase orders and offers the direct validation link to admins", async () => {
    mocks.requireTenant.mockResolvedValue({ role: "OWNER" });
    const html = renderToStaticMarkup(await ExportPage());
    expect(html).toContain("仕入発注と過去履歴");
    expect(html).toContain("受注と過去履歴");
    expect(html).toContain('href="/api/export/purchase-orders"');
    expect(html).toContain('href="/settings/import/purchase-orders"');
    expect(html).toContain("このCSVを検証する");
  });

  it("does not expose download or preflight CTAs to STAFF", async () => {
    mocks.requireTenant.mockResolvedValue({ role: "STAFF" });
    const html = renderToStaticMarkup(await ExportPage());
    expect(html).toContain("管理者");
    expect(html).not.toContain('href="/api/export/purchase-orders"');
    expect(html).not.toContain('href="/settings/import/purchase-orders"');
  });
});
