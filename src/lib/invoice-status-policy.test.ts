import { describe, expect, it } from "vitest";
import {
  allowedInvoiceTransition,
  canDeleteInvoice,
  mayManageInvoices,
} from "./invoice-status-policy";

describe("original invoice authorization and lifecycle policy", () => {
  it("restricts financially significant actions to OWNER and ADMIN", () => {
    expect(mayManageInvoices("OWNER")).toBe(true);
    expect(mayManageInvoices("ADMIN")).toBe(true);
    for (const role of ["STAFF", "VIEWER", "owner", ""]) {
      expect(mayManageInvoices(role)).toBe(false);
    }
  });
  it("permits only forward transitions and controlled cancellations", () => {
    expect(allowedInvoiceTransition("DRAFT", "ISSUED")).toBe(true);
    expect(allowedInvoiceTransition("DRAFT", "CANCELLED")).toBe(true);
    expect(allowedInvoiceTransition("ISSUED", "PAID")).toBe(true);
    expect(allowedInvoiceTransition("ISSUED", "CANCELLED")).toBe(true);
    for (const [from, to] of [
      ["DRAFT", "PAID"], ["ISSUED", "DRAFT"], ["PAID", "DRAFT"],
      ["PAID", "CANCELLED"], ["CANCELLED", "ISSUED"],
      ["CANCELLED", "PAID"], ["ISSUED", "ISSUED"],
    ] as const) {
      expect(allowedInvoiceTransition(from, to)).toBe(false);
    }
    expect(allowedInvoiceTransition("DRAFT", "INJECTED")).toBe(false);
    expect(allowedInvoiceTransition("DRAFT", null)).toBe(false);
  });
  it("allows deleting a draft only; issued/paid/cancelled are preserved", () => {
    expect(canDeleteInvoice("DRAFT")).toBe(true);
    expect(canDeleteInvoice("ISSUED")).toBe(false);
    expect(canDeleteInvoice("PAID")).toBe(false);
    expect(canDeleteInvoice("CANCELLED")).toBe(false);
  });
});
