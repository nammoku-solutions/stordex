/**
 * Issue #82: non-mutating buyer-side B2B returns readiness preview.
 *
 * This is NOT a return authorization or quantity reservation. A full workflow
 * still requires explicitly linked seller order line IDs, immutable return
 * dispatch/inspection records, and credit-note migration.
 */
type BuyerPOStatus = "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED";
type SellerOrderStatus = "DRAFT" | "CONFIRMED" | "SHIPPED" | "COMPLETED" | "CANCELLED";
type CompanyOrderStatus = "SENT" | "ACCEPTED" | "REJECTED" | "CANCELLED";
type ConnectionStatus = "PENDING" | "ACTIVE" | "DECLINED" | "REVOKED";

export type BuyerReceiptLine = {
  id: string;
  itemName: string;
  quantity: number;
  received: number;
  unit: string;
};
export type CompanyOrderLine = {
  sourcePurchaseOrderItemId: string;
  quantity: number;
  unit: string;
};

export type ReturnReadiness = {
  status: "RECEIPTS_RECORDED" | "NOT_READY" | "REQUIRES_MANUAL_REVIEW";
  message: string;
  /**
   * Source received counts only; never assume these remain returnable after
   * existing/manual returns, stock movements, or partner inspection.
   */
  receivedLines: { id: string; itemName: string; received: number; unit: string }[];
};

export function assessB2BReturnReadiness(input: {
  buyerPOStatus: BuyerPOStatus;
  companyStatus: CompanyOrderStatus;
  sellerOrderStatus: SellerOrderStatus | null;
  connectionStatus: ConnectionStatus;
  buyerLines: readonly BuyerReceiptLine[];
  companyLines: readonly CompanyOrderLine[];
}): ReturnReadiness {
  const blocked = (message: string): ReturnReadiness => ({
    status: "NOT_READY", message, receivedLines: [],
  });
  const uncertain = (message: string): ReturnReadiness => ({
    status: "REQUIRES_MANUAL_REVIEW", message, receivedLines: [],
  });
  if (input.companyStatus !== "ACCEPTED") {
    return blocked("企業間発注が受注済みではないため、出荷後返品の対象ではありません。");
  }
  if (!input.sellerOrderStatus ||
      !["SHIPPED", "COMPLETED"].includes(input.sellerOrderStatus)) {
    return blocked("先方の出荷が完了していません。出荷前の取消とは別の手続きです。");
  }
  if (input.buyerPOStatus !== "RECEIVED") {
    return blocked("自社の入荷が確定されていません。まず実際の入荷数を確認してください。");
  }
  if (input.connectionStatus !== "ACTIVE") {
    return uncertain("企業間接続が有効ではありません。先方との契約・連携状態を確認してください。");
  }
  if (!input.buyerLines.length ||
      input.buyerLines.length !== input.companyLines.length) {
    return uncertain("元発注の明細対応を確認できません。返品数量を自動判定できません。");
  }

  const sourceLines = new Map(input.companyLines.map(line => [
    line.sourcePurchaseOrderItemId, line,
  ]));
  if (sourceLines.size !== input.companyLines.length ||
      new Set(input.buyerLines.map(line => line.id)).size !== input.buyerLines.length) {
    return uncertain("元発注の明細IDに重複があります。返品数量を自動判定できません。");
  }
  for (const line of input.buyerLines) {
    const snap = sourceLines.get(line.id);
    if (!snap || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 ||
        !Number.isSafeInteger(line.received) || line.received < 0 ||
        line.received > line.quantity ||
        line.quantity !== snap.quantity || line.unit !== snap.unit) {
      return uncertain("発注明細と企業間履歴の数量・単位が一致しません。手動照合が必要です。");
    }
  }
  const receivedLines = input.buyerLines.filter(line => line.received > 0)
    .map(line => ({ id: line.id, itemName: line.itemName,
      received: line.received, unit: line.unit }));
  if (receivedLines.length === 0) {
    return blocked("入荷済みの数量がありません。返品対象の現品を確認してください。");
  }
  return {
    status: "RECEIPTS_RECORDED",
    message: "出荷・入荷の履歴を確認できました。表示数量は元の入荷済み数量であり、返品可能数量・在庫数・返金額を保証しません。",
    receivedLines,
  };
}
