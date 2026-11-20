import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTenant: vi.fn(),
  prisma: {
    customer: { count: vi.fn() },
    supplier: { count: vi.fn() },
    item: { count: vi.fn(), findMany: vi.fn() },
    order: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
    orderItem: { groupBy: vi.fn() },
    intercompanyOrder: { count: vi.fn(), findMany: vi.fn() },
    purchaseOrder: { count: vi.fn(), findMany: vi.fn() },
    inventoryMovement: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/session", () => ({ requireTenant: mocks.requireTenant }));
vi.mock("../inventory/MovementForm", () => ({ MovementForm: () => null }));

import DashboardPage from "./page";
import InboundOrdersPage from "../orders/inbox/page";
import PurchaseOrdersPage from "../purchase-orders/page";
import InventoryPage from "../inventory/page";

const tenantId = "current-tenant";
const { prisma } = mocks;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireTenant.mockResolvedValue({
    tenantId,
    role: "STAFF",
    session: { user: { tenantName: "検証会社" } },
  });
  prisma.customer.count.mockResolvedValue(0);
  prisma.supplier.count.mockResolvedValue(0);
  prisma.item.count.mockResolvedValue(0);
  prisma.item.findMany.mockResolvedValue([]);
  prisma.order.count.mockResolvedValue(0);
  prisma.order.aggregate.mockResolvedValue({ _sum: { total: null }, _count: { _all: 0 } });
  prisma.order.findMany.mockResolvedValue([]);
  prisma.intercompanyOrder.count.mockResolvedValue(0);
  prisma.intercompanyOrder.findMany.mockResolvedValue([]);
  prisma.purchaseOrder.count.mockResolvedValue(0);
  prisma.purchaseOrder.findMany.mockResolvedValue([]);
  prisma.inventoryMovement.findMany.mockResolvedValue([]);
});

describe("daily work from the dashboard", () => {
  it("puts three specific destinations before summaries and uses tenant-scoped counts", async () => {
    prisma.intercompanyOrder.count.mockResolvedValue(2);
    prisma.purchaseOrder.count.mockResolvedValue(3);
    prisma.item.findMany.mockResolvedValueOnce([
      { id: "sku-low", code: "A", name: "常備品", unit: "個", stock: 2, stockPolicy: "STOCKED", reorderPoint: 5 },
      { id: "sku-ok", code: "B", name: "在庫あり", unit: "個", stock: 5, stockPolicy: "STOCKED", reorderPoint: 5 },
    ]);

    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain('href="/orders/inbox?view=pending"');
    expect(html).toContain('href="/purchase-orders?status=ORDERED"');
    expect(html).toContain('href="/inventory#low-stock"');
    expect(html).toContain("確認待ち 2 件");
    expect(html).toContain("発注済み・未入荷 3 件");
    expect(html).toContain("最低在庫を下回った常備品 1 品目");
    expect(html.indexOf("よく使う操作")).toBeLessThan(html.indexOf("売上・登録件数"));
    expect(prisma.intercompanyOrder.count).toHaveBeenCalledWith({ where: { sellerTenantId: tenantId, status: "SENT" } });
    expect(prisma.purchaseOrder.count).toHaveBeenCalledWith({ where: { tenantId, status: "ORDERED" } });
  });

  it("keeps all three links usable when no work is waiting", async () => {
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain("確認待ちの注文はありません");
    expect(html).toContain("入荷待ちの発注はありません");
    expect(html).toContain("最低在庫を下回った常備品はありません");
    expect(html).toContain('href="/orders/inbox?view=pending"');
    expect(html).toContain('href="/purchase-orders?status=ORDERED"');
    expect(html).toContain('href="/inventory#low-stock"');
  });

  it("only filters seller-owned pending orders when requested and keeps all history reachable", async () => {
    const html = renderToStaticMarkup(await InboundOrdersPage({ searchParams: Promise.resolve({ view: "pending" }) }));
    expect(prisma.intercompanyOrder.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { sellerTenantId: tenantId, status: "SENT" },
    }));
    expect(html).toContain("確認待ちの注文はありません");
    expect(html).toContain('href="/orders/inbox"');

    await InboundOrdersPage({ searchParams: Promise.resolve({ view: ["pending", "all"] }) });
    expect(prisma.intercompanyOrder.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { sellerTenantId: tenantId },
    }));
  });

  it("awaits purchase filters, combines them with search, and describes the actual receipt action", async () => {
    const html = renderToStaticMarkup(await PurchaseOrdersPage({ searchParams: Promise.resolve({ status: "ORDERED", q: "  PO-1  " }) }));
    expect(prisma.purchaseOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId,
        status: "ORDERED",
        OR: [
          { poNumber: { contains: "PO-1", mode: "insensitive" } },
          { supplier: { name: { contains: "PO-1", mode: "insensitive" } } },
        ],
      },
    }));
    expect(html).toContain("商品が届いたら、発注番号を開いて実際に届いた数を登録します");
    expect(html).toContain('href="/purchase-orders"');
  });

  it.each([{ status: "invalid" }, { status: "constructor" }, { status: ["ORDERED", "RECEIVED"] }])("ignores an invalid or repeated purchase status ($status)", async ({ status }) => {
    await PurchaseOrdersPage({ searchParams: Promise.resolve({ status }) });
    expect(prisma.purchaseOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId } }));
  });

  it("renders the inventory destination at the actual low-stock panel", async () => {
    const html = renderToStaticMarkup(await InventoryPage());
    expect(html).toContain('id="low-stock"');
    expect(html).toContain('aria-labelledby="low-stock-title"');
    expect(html).toContain('id="low-stock-title"');
    expect(html).toContain("常備在庫品の最低在庫割れ");
  });
});
