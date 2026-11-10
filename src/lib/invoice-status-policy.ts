import type { InvoiceStatus, Role } from "@/generated/prisma/client";

/** Source invoices may be issued only by an active authenticated tenant admin. */
export function mayManageInvoices(role: Role | string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

const TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ["ISSUED", "CANCELLED"],
  ISSUED: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};

/** Never trust the TypeScript type of an untrusted Server Action argument. */
export function allowedInvoiceTransition(
  current: InvoiceStatus,
  requested: unknown,
): requested is InvoiceStatus {
  return typeof requested === "string" &&
    TRANSITIONS[current].includes(requested as InvoiceStatus);
}

export function canDeleteInvoice(status: InvoiceStatus): boolean {
  return status === "DRAFT";
}
