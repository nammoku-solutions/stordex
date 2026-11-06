/** Return request workflow labels shared between buyer and seller UI. */
export const B2B_RETURN_STATUS_LABEL = {
  SUBMITTED: "申請済み",
  UNDER_REVIEW: "審査中",
  PARTIALLY_APPROVED: "一部承認",
  APPROVED: "承認済み",
  REJECTED: "否認",
  WITHDRAWN: "取下げ",
  DISPATCHED: "返送済み",
  PARTIALLY_INSPECTED: "一部検品済み",
  INSPECTED: "検品済み",
  CREDIT_PENDING: "金額調整待ち",
  CLOSED: "完了",
} as const;

export const B2B_RETURN_REASON_LABEL = {
  DAMAGED: "破損・不良",
  WRONG_ITEM: "商品違い",
  UNWANTED: "注文変更",
  OTHER: "その他",
} as const;
