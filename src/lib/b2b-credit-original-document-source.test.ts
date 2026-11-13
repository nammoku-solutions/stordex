import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareAuthenticatedOriginalInvoiceDocument as prepare } from "./b2b-credit-original-document-source";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), invoice: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));

const actor = { id: "user-one", tenantId: "tenant-a", role: "ADMIN" };
const invoice = () => ({
  id: "invoice-one", tenantId: actor.tenantId, status: "ISSUED", invoiceNumber: "INV-01",
  issueDate: new Date("2026-11-11T00:00:00.000Z"), periodYear: 2026, periodMonth: 11,
  subtotal: 1000, tax: 100, total: 1100, taxRate: 10, taxPerOrder: false,
  orders: [{ order: {
    id: "order-one", tenantId: actor.tenantId, subtotal: 1000, tax: 100, total: 1100, taxRate: 10,
    items: [{ id: "line-one", itemId: "item-one", quantity: 2, unitPrice: 500, amount: 1000,
      item: { tenantId: actor.tenantId } }],
  } }],
});
const input = () => ({
  invoiceId: "invoice-one", filename: "original.pdf", mimeType: "application/pdf",
  bytes: new TextEncoder().encode("%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n"),
});

describe("authenticated original invoice source preparation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ user: actor });
    mocks.user.mockResolvedValue(actor);
    mocks.invoice.mockResolvedValue(invoice());
    mocks.transaction.mockImplementation((callback) => callback({
      user: { findFirst: mocks.user }, invoice: { findFirst: mocks.invoice },
    }));
  });

  it("uses server identity, current DB membership, and a tenant-scoped read snapshot", async () => {
    const first = await prepare({ ...input(), ...{ tenantId: "tenant-b", snapshotSha256: "browser-hash" } });
    const second = await prepare(input());
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead", timeout: 15_000,
    });
    expect(mocks.user).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: actor.id, tenantId: actor.tenantId, role: { in: ["OWNER", "ADMIN"] }, tenant: { status: "ACTIVE" },
    } }));
    expect(mocks.invoice).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "invoice-one", tenantId: actor.tenantId, status: { in: ["ISSUED", "PAID"] },
    } }));
    expect(first).toMatchObject({
      accepted: true, proposedPrivateObjectKey: expect.stringContaining("/tenant-a/invoice-one/"),
      sourceSnapshotSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      storageCompleted: false, independentReviewCompleted: false,
      currencyVerified: false, financialPostingAllowed: false,
    });
    if (!first.accepted || !second.accepted) throw new Error("Expected two valid candidates");
    expect(first.sourceSnapshotSha256).toBe(second.sourceSnapshotSha256);
  });

  it("stops if current membership does not authorize the user", async () => {
    mocks.user.mockResolvedValue(null);
    await expect(prepare(input())).resolves.toEqual({ accepted: false, reason: "SOURCE_UNAVAILABLE" });
    expect(mocks.invoice).not.toHaveBeenCalled();
  });

  it("stops with missing session identity or a malformed invoice id", async () => {
    mocks.session.mockResolvedValueOnce({ user: { ...actor, id: undefined } });
    await expect(prepare(input())).resolves.toMatchObject({ accepted: false });
    await expect(prepare({ ...input(), invoiceId: "../invoice" })).resolves.toMatchObject({ accepted: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("preserves the existing sign-in gate", async () => {
    const unauthenticated = new Error("sign in required");
    mocks.session.mockRejectedValue(unauthenticated);
    await expect(prepare(input())).rejects.toBe(unauthenticated);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([null, { ...invoice(), tenantId: "tenant-b" }, { ...invoice(), status: "CANCELLED" }])(
    "does not distinguish missing, foreign, and non-issued invoices", async (record) => {
      mocks.invoice.mockResolvedValue(record);
      await expect(prepare(input())).resolves.toEqual({ accepted: false, reason: "SOURCE_UNAVAILABLE" });
    },
  );

  it("rejects foreign linked orders, foreign items, and inconsistent financial amounts", async () => {
    const foreignOrder = invoice();
    foreignOrder.orders[0].order.tenantId = "tenant-b";
    const foreignItem = invoice();
    foreignItem.orders[0].order.items[0].item.tenantId = "tenant-b";
    const badAmount = invoice();
    badAmount.orders[0].order.items[0].amount = 999;
    for (const record of [foreignOrder, foreignItem, badAmount, { ...invoice(), orders: [] }]) {
      mocks.invoice.mockResolvedValue(record);
      await expect(prepare(input())).resolves.toEqual({ accepted: false, reason: "SOURCE_INTEGRITY_FAILED" });
    }
  });

  it("rejects oversized snapshots and invalid PDF candidates", async () => {
    const record = invoice();
    mocks.invoice.mockResolvedValueOnce({ ...record, orders: Array(201).fill(record.orders[0]) });
    await expect(prepare(input())).resolves.toMatchObject({ accepted: false, reason: "SOURCE_INTEGRITY_FAILED" });
    record.orders[0].order.items = Array(501).fill(record.orders[0].order.items[0]);
    mocks.invoice.mockResolvedValueOnce(record);
    await expect(prepare(input())).resolves.toMatchObject({ accepted: false, reason: "SOURCE_INTEGRITY_FAILED" });
    await expect(prepare({ ...input(), mimeType: "text/html" })).resolves.toMatchObject({
      accepted: false, reason: "INVALID_CONTENT_TYPE",
    });
  });
});
