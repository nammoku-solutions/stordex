import type { Prisma } from "@/generated/prisma/client";

/** Database-safe daily document numbering for both direct and B2B order creators.
 *
 * The PostgreSQL transaction-scoped advisory lock protects the read-last +
 * insert sequence. All writers of SO-/P- numbers must call this INSIDE the
 * transaction that persists the new document.
 *
 * If an import reserves a manual order number concurrently, the existing
 * tenant-scoped unique constraint remains the last line of defense.
 */
export type DocumentKind = "SO" | "P";

export function tokyoDocumentDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (kind: "year" | "month" | "day") =>
    parts.find((p) => p.type === kind)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) throw new Error("伝票日付を生成できません");
  return `${year}${month}${day}`;
}

export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  kind: DocumentKind,
  now: Date = new Date(),
): Promise<string> {
  const day = tokyoDocumentDate(now);
  const prefix = `${kind}-${day}-`;

  // Same pair of advisory locks in all order/PO creation flows.
  // Parameterized query: no user input is interpolated into SQL source.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(
    hashtext(${"stordex:number:" + tenantId}),
    hashtext(${kind + ":" + day})
  )`;

  const last = kind === "SO"
    ? await tx.order.findFirst({
        where: { tenantId, orderNumber: { startsWith: prefix } },
        orderBy: { orderNumber: "desc" },
        select: { orderNumber: true },
      })
    : await tx.purchaseOrder.findFirst({
        where: { tenantId, poNumber: { startsWith: prefix } },
        orderBy: { poNumber: "desc" },
        select: { poNumber: true },
      });

  const prior = last ? (kind === "SO"
    ? ("orderNumber" in last ? last.orderNumber : "")
    : ("poNumber" in last ? last.poNumber : "")) : "";
  const priorNumber = prior.startsWith(prefix) ? Number(prior.slice(prefix.length)) : 0;
  if (!Number.isSafeInteger(priorNumber) || priorNumber < 0) {
    throw new Error("直前の伝票番号が不正です");
  }
  return prefix + String(priorNumber + 1).padStart(4, "0");
}
