export type ItemRemovalNotice = {
  tone: "error" | "success" | "info";
  title: string;
  message: string;
  links?: readonly { href: string; label: string }[];
};

/** Centralized, user-facing feedback for safe item removal outcomes. */
const NOTICES: Record<string, ItemRemovalNotice> = {
  removed: {
    tone: "success",
    title: "商品を削除しました",
    message: "取引履歴・入出庫履歴がない商品を削除しました。",
  },
  retired: {
    tone: "success",
    title: "商品の取扱を停止しました",
    message: "過去の取引・入出庫履歴は保持しています。「取扱停止商品を表示」から再開できます。",
  },
  "already-retired": {
    tone: "info",
    title: "すでに取扱停止になっています",
    message: "「取扱停止商品を表示」から状態を確認できます。",
  },
  "stock-remains": {
    tone: "error",
    title: "商品を削除できません",
    message: "現在庫が残っています。実際の在庫数量を確認してください。削除のためだけに棚卸数量を変更しないでください。",
    links: [{ href: "/inventory", label: "在庫管理を確認" }],
  },
  "open-transactions": {
    tone: "error",
    title: "商品を削除できません",
    message: "未完了の受注・仕入発注・見積があります。関連する取引を正しく完了または取消してから操作してください。",
    links: [
      { href: "/orders", label: "受注を確認" },
      { href: "/purchase-orders", label: "仕入発注を確認" },
      { href: "/quotations", label: "見積を確認" },
    ],
  },
  "concurrent-change": {
    tone: "error",
    title: "商品を削除できません",
    message: "削除処理中に在庫または取引が更新されました。画面を再読み込みして、最新の状態を確認してください。",
  },
  "not-found": {
    tone: "error",
    title: "対象の商品が見つかりません",
    message: "すでに削除済みか、アクセスできない商品です。商品一覧を再確認してください。",
  },
  reactivated: {
    tone: "success",
    title: "商品の取扱を再開しました",
    message: "商品が有効になりました。受発注に利用できます。",
  },
};

export function getItemRemovalNotice(code: string | undefined): ItemRemovalNotice | null {
  if (!code || !Object.hasOwn(NOTICES, code)) return null;
  return NOTICES[code];
}
