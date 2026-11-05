/**
 * Issue #110 — notification planning ONLY. Does not read User.email, query the
 * database, create an outbox record, or invoke a mail provider. Nothing sends
 * until an approved transactional outbox and worker are implemented.
 *
 * The caller must derive buyer/seller IDs from a freshly read, authorized
 * IntercompanyOrder inside its transaction. The catalog determines who gets
 * notified, rather than trusting a caller-selected arbitrary recipient.
 */
import { createHash } from "node:crypto";

export type OrderEmailEventKind =
  | "NEW_LOCAL_ORDER"
  | "NEW_B2B_ORDER"
  | "B2B_ORDER_ACCEPTED"
  | "B2B_ORDER_REJECTED"
  | "B2B_SELLER_ORDER_SHIPPED"
  | "B2B_BUYER_PO_RECEIVED";

type EventDefinition = {
  recipient: "BUYER" | "SELLER";
  title: string;
  preview: string;
  detail: "SELLER_INBOX" | "SELLER_ORDER" | "BUYER_PO";
};

/** The wording deliberately omits product, customer and price data. */
export const ORDER_EMAIL_EVENT_CATALOG: Readonly<Record<OrderEmailEventKind, EventDefinition>> = {
  NEW_LOCAL_ORDER: {
    recipient: "SELLER",
    title: "【Stordex】新しい受注が登録されました",
    preview: "受注管理画面で内容をご確認ください。",
    detail: "SELLER_ORDER",
  },
  NEW_B2B_ORDER: {
    recipient: "SELLER",
    title: "【Stordex】企業間発注を受信しました",
    preview: "企業間受注トレイで発注内容をご確認ください。",
    detail: "SELLER_INBOX",
  },
  B2B_ORDER_ACCEPTED: {
    recipient: "BUYER",
    title: "【Stordex】企業間発注が受注されました",
    preview: "仕入先発注画面で最新の状態をご確認ください。",
    detail: "BUYER_PO",
  },
  B2B_ORDER_REJECTED: {
    recipient: "BUYER",
    title: "【Stordex】企業間発注の状態が更新されました",
    preview: "仕入先発注画面で最新の状態をご確認ください。",
    detail: "BUYER_PO",
  },
  B2B_SELLER_ORDER_SHIPPED: {
    recipient: "BUYER",
    title: "【Stordex】仕入先からの出荷状況が更新されました",
    preview: "仕入先発注画面で最新の状態をご確認ください。",
    detail: "BUYER_PO",
  },
  B2B_BUYER_PO_RECEIVED: {
    recipient: "SELLER",
    title: "【Stordex】発注元企業の入荷状況が更新されました",
    preview: "受注管理画面で最新の状態をご確認ください。",
    detail: "SELLER_ORDER",
  },
};

export type PlannedOrderEmailEvent = {
  eventKind: OrderEmailEventKind;
  recipientTenantId: string;
  /** Future outbox: persist this with a UNIQUE index on recipient+event. */
  dedupeKey: string;
  subject: string;
  preview: string;
  relativeUrl: string;
};

const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export class NotificationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationContractError";
  }
}

/**
 * Produce a stable event envelope, not an email. An eventual worker must
 * check tenant ownership/recipient role, verified active email, individual
 * preferences and suppression at delivery time, and must only use an outbox
 * committed atomically with the business state change.
 */
export function planOrderEmailEvent(input: {
  kind: OrderEmailEventKind;
  sourceEventId: string;
  sellerTenantId: string;
  buyerTenantId?: string | null;
  sellerOrderId?: string | null;
  buyerPurchaseOrderId?: string | null;
}): PlannedOrderEmailEvent {
  if (!Object.hasOwn(ORDER_EMAIL_EVENT_CATALOG, input.kind)) {
    throw new NotificationContractError("通知種別が不正です");
  }
  const def = ORDER_EMAIL_EVENT_CATALOG[input.kind];
  if (!UUID.test(input.sourceEventId)) {
    throw new NotificationContractError("業務イベントIDが不正です");
  }
  if (!SAFE_ID.test(input.sellerTenantId)) {
    throw new NotificationContractError("受注企業が不明です");
  }
  if (input.kind !== "NEW_LOCAL_ORDER" &&
      (!input.buyerTenantId || !SAFE_ID.test(input.buyerTenantId) ||
       input.buyerTenantId === input.sellerTenantId)) {
    throw new NotificationContractError("企業間取引の双方の企業IDが不正です");
  }

  const recipientTenantId = def.recipient === "SELLER"
    ? input.sellerTenantId : input.buyerTenantId!;
  let relativeUrl: string;
  if (def.detail === "SELLER_INBOX") relativeUrl = "/orders/inbox";
  else if (def.detail === "SELLER_ORDER") {
    if (!input.sellerOrderId || !SAFE_ID.test(input.sellerOrderId)) {
      throw new NotificationContractError("受注の参照先が不正です");
    }
    relativeUrl = "/orders/" + input.sellerOrderId;
  } else {
    if (!input.buyerPurchaseOrderId || !SAFE_ID.test(input.buyerPurchaseOrderId)) {
      throw new NotificationContractError("発注の参照先が不正です");
    }
    relativeUrl = "/purchase-orders/" + input.buyerPurchaseOrderId;
  }

  const keySource = [
    "stordex-email-v1", input.kind, input.sourceEventId.toLowerCase(),
    recipientTenantId,
  ].join(":");
  return {
    eventKind: input.kind,
    recipientTenantId,
    dedupeKey: createHash("sha256").update(keySource).digest("hex"),
    subject: def.title,
    preview: def.preview,
    relativeUrl,
  };
}
