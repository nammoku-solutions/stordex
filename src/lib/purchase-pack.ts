/** Purchase order quantities and inventory always use the SKU's base unit. */
export function purchaseLinePackSnapshot(
  item: {purchaseMode:"UNIT"|"PACK";caseQty:number|null;orderUnit:string|null},
  quantity:number,
): {packSize:number|null;packCount:number|null;packUnit:string|null} {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("発注数量は1以上の整数で入力してください");
  }
  if (item.purchaseMode === "UNIT") {
    return {packSize:null,packCount:null,packUnit:null};
  }
  if (!item.caseQty || !Number.isSafeInteger(item.caseQty) || item.caseQty < 2 ||
      quantity % item.caseQty !== 0) {
    throw new Error("パック仕入品は1パック入数の整数倍で発注してください");
  }
  return {
    packSize:item.caseQty,
    packCount:quantity/item.caseQty,
    packUnit:item.orderUnit?.trim() || "パック",
  };
}
