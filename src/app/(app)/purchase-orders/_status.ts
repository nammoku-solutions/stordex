// 仕入先発注ステータスのラベル・バッジ色
export const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き",
  ORDERED: "発注済",
  RECEIVED: "入荷済",
  CANCELLED: "取消",
};

export const PO_STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ORDERED: "bg-blue-100 text-blue-700",
  RECEIVED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};
