// 見積書ステータスのラベル・バッジ色
export const QUOTATION_STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き",
  SENT: "送付済",
  ACCEPTED: "受諾",
  REJECTED: "却下",
  EXPIRED: "期限切れ",
};

export const QUOTATION_STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  EXPIRED: "bg-amber-100 text-amber-800",
};
