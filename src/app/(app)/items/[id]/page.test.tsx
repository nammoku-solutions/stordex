import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  tenant: vi.fn(),
  findItem: vi.fn(),
  findSuppliers: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireTenant: mock.tenant }));
vi.mock("@/lib/db", () => ({
  prisma: {
    item: { findFirst: mock.findItem },
    supplier: { findMany: mock.findSuppliers },
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("@/components/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("../ItemForm", () => ({ ItemForm: () => null }));
vi.mock("../actions", () => ({ updateItem: vi.fn() }));

import EditItemPage from "./page";

describe("item edit page resolves selected item within the tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.tenant.mockResolvedValue({ tenantId: "demo-tenant" });
    mock.findSuppliers.mockResolvedValue([]);
    mock.findItem.mockImplementation(async ({ where }) => {
      const found = {
        "uat-demo-item-PEN": { id: "uat-demo-item-PEN", name: "黒ボールペン" },
        "uat-demo-item-NOTE": { id: "uat-demo-item-NOTE", name: "B5ノート" },
      } as Record<string, { id: string; name: string }>;
      return where.tenantId === "demo-tenant" ? found[where.id] ?? null : null;
    });
  });

  it("uses the clicked NOTE ID, not the first item PEN", async () => {
    await EditItemPage({ params: Promise.resolve({ id: "uat-demo-item-NOTE" }) });
    expect(mock.findItem).toHaveBeenCalledWith({
      where: { id: "uat-demo-item-NOTE", tenantId: "demo-tenant" },
    });
  });

  it("uses the selected PEN ID when PEN was clicked", async () => {
    await EditItemPage({ params: Promise.resolve({ id: "uat-demo-item-PEN" }) });
    expect(mock.findItem).toHaveBeenCalledWith({
      where: { id: "uat-demo-item-PEN", tenantId: "demo-tenant" },
    });
  });

  it("never silently falls back to another item for a missing ID", async () => {
    await expect(EditItemPage({ params: Promise.resolve({ id: "does-not-exist" }) }))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(mock.findItem).toHaveBeenCalledWith({
      where: { id: "does-not-exist", tenantId: "demo-tenant" },
    });
  });
});
