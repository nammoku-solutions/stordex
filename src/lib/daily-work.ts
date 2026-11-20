export const INBOUND_REVIEW_STATUS = "SENT";
export const AWAITING_RECEIPT_STATUS = "ORDERED";
export const LOW_STOCK_SECTION_ID = "low-stock";

export const dailyWorkLinks = {
  pendingInbound: "/orders/inbox?view=pending",
  awaitingReceipt: `/purchase-orders?status=${AWAITING_RECEIPT_STATUS}`,
  lowStock: `/inventory#${LOW_STOCK_SECTION_ID}`,
} as const;

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function singleQuery(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}
