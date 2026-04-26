// 請求書ステータスのラベル・バッジ色（page.tsx と詳細画面で共有）
export const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き",
  ISSUED: "発行済",
  PAID: "入金済",
  CANCELLED: "無効",
};

export const INVOICE_STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ISSUED: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};
