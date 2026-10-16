/**
 * CSV インポート対象ごとの「Stordex 内部フィールド定義」。
 *
 * mapping は { fieldKey: csvHeaderName } で表現される。
 * fieldKey はここで定義したものに限定。
 */

import type { ImportTarget } from "@/generated/prisma/client";

export type FieldType = "string" | "int" | "bool" | "date";

export interface FieldDef {
  /** Stordex 内部のキー (mapping の左辺) */
  key: string;
  /** UI 表示用ラベル */
  label: string;
  /** データ型 */
  type: FieldType;
  /** 必須かどうか */
  required?: boolean;
  /** 自動マッピング時に試行するヘッダ候補（UI でも候補表示に使える） */
  aliases?: string[];
  /** 補足説明 */
  hint?: string;
}

/**
 * 商品マスタ（Item）
 */
export const ITEM_FIELDS: FieldDef[] = [
  { key: "code", label: "商品コード", type: "string", required: true, aliases: ["商品コード", "コード", "JAN", "ItemCode", "SKU", "Code"] },
  { key: "name", label: "商品名", type: "string", required: true, aliases: ["商品名", "品名", "Name", "ItemName"] },
  { key: "nameKana", label: "商品名カナ", type: "string", aliases: ["カナ", "フリガナ", "NameKana"] },
  { key: "unit", label: "単位", type: "string", aliases: ["単位", "Unit"] },
  { key: "spec", label: "規格", type: "string", aliases: ["規格", "サイズ", "荷姿", "Spec"] },
  { key: "origin", label: "産地", type: "string", aliases: ["産地", "原産地", "Origin"] },
  { key: "caseQty", label: "ケース入数", type: "int", aliases: ["ケース入数", "入数", "CaseQty"] },
  { key: "orderUnit", label: "発注単位", type: "string", aliases: ["発注単位", "OrderUnit"] },
  { key: "barcode", label: "バーコード", type: "string", aliases: ["バーコード", "JAN", "Barcode"] },
  { key: "stock", label: "在庫数", type: "int", aliases: ["在庫", "在庫数", "Stock"] },
  { key: "reorderPoint", label: "発注点", type: "int", aliases: ["発注点", "ReorderPoint"] },
  { key: "costPrice", label: "仕入単価", type: "int", aliases: ["仕入単価", "原価", "CostPrice"] },
  { key: "salesPrice", label: "販売単価", type: "int", aliases: ["販売単価", "売価", "Price", "SalesPrice"] },
  { key: "supplierCode", label: "仕入先コード", type: "string", aliases: ["仕入先コード", "SupplierCode"], hint: "既存の仕入先と紐付けに使用" },
  { key: "category", label: "カテゴリ", type: "string", aliases: ["カテゴリ", "分類", "Category"] },
  { key: "note", label: "備考", type: "string", aliases: ["備考", "メモ", "Note", "Memo"] },
];

/**
 * 得意先（Customer）
 */
export const CUSTOMER_FIELDS: FieldDef[] = [
  { key: "code", label: "得意先コード", type: "string", required: true, aliases: ["得意先コード", "顧客コード", "コード", "Code", "CustomerCode"] },
  { key: "name", label: "得意先名", type: "string", required: true, aliases: ["得意先名", "顧客名", "Name", "CustomerName"] },
  { key: "nameKana", label: "カナ", type: "string", aliases: ["カナ", "フリガナ", "NameKana"] },
  { key: "branch", label: "営業所", type: "string", aliases: ["営業所", "Branch"] },
  { key: "groupName", label: "顧客グループ", type: "string", aliases: ["グループ", "Group"] },
  { key: "postalCode", label: "郵便番号", type: "string", aliases: ["郵便番号", "PostalCode", "Zip"] },
  { key: "address", label: "住所", type: "string", aliases: ["住所", "Address"] },
  { key: "phone", label: "電話番号", type: "string", aliases: ["電話", "TEL", "Phone"] },
  { key: "fax", label: "FAX", type: "string", aliases: ["FAX", "Fax"] },
  { key: "email", label: "メール", type: "string", aliases: ["メール", "Email", "EMail"] },
  { key: "contact", label: "担当者", type: "string", aliases: ["担当者", "Contact"] },
  { key: "nextDayOrder", label: "翌日注文", type: "bool", aliases: ["翌日注文", "NextDay"] },
  { key: "note", label: "備考", type: "string", aliases: ["備考", "Note"] },
];

/**
 * 仕入先（Supplier）
 */
export const SUPPLIER_FIELDS: FieldDef[] = [
  { key: "code", label: "仕入先コード", type: "string", required: true, aliases: ["仕入先コード", "コード", "SupplierCode", "Code"] },
  { key: "name", label: "仕入先名", type: "string", required: true, aliases: ["仕入先名", "Name", "SupplierName"] },
  { key: "nameKana", label: "カナ", type: "string", aliases: ["カナ", "NameKana"] },
  { key: "postalCode", label: "郵便番号", type: "string", aliases: ["郵便番号", "PostalCode"] },
  { key: "address", label: "住所", type: "string", aliases: ["住所", "Address"] },
  { key: "phone", label: "電話番号", type: "string", aliases: ["電話", "TEL", "Phone"] },
  { key: "fax", label: "FAX", type: "string", aliases: ["FAX"] },
  { key: "email", label: "メール", type: "string", aliases: ["メール", "Email"] },
  { key: "contact", label: "担当者", type: "string", aliases: ["担当者", "Contact"] },
  { key: "note", label: "備考", type: "string", aliases: ["備考", "Note"] },
];

/**
 * 受注（Order）
 *
 * 1 受注 = 複数明細。CSV は「受注ヘッダ＋明細が同じ行に並ぶ」想定（業界標準）。
 * 同じ orderNumber でグループ化し、ヘッダ情報は最初の行のものを使用。
 */
export const ORDER_FIELDS: FieldDef[] = [
  { key: "orderNumber", label: "受注番号", type: "string", required: true, aliases: ["受注番号", "注文番号", "伝票番号", "OrderNumber", "OrderNo"] },
  { key: "customerCode", label: "得意先コード", type: "string", required: true, aliases: ["得意先コード", "顧客コード", "CustomerCode"] },
  { key: "customerName", label: "得意先名", type: "string", aliases: ["得意先名", "顧客名", "CustomerName"], hint: "コードで未マッチの時に新規作成" },
  { key: "orderDate", label: "受注日", type: "date", required: true, aliases: ["受注日", "注文日", "OrderDate"] },
  { key: "dueDate", label: "納品日", type: "date", aliases: ["納品日", "納期", "DueDate", "DeliveryDate"] },
  { key: "orderer", label: "発注者", type: "string", aliases: ["発注者", "Orderer"] },
  { key: "orderNote", label: "受注備考", type: "string", aliases: ["備考", "OrderNote"] },
  // 明細
  { key: "itemCode", label: "商品コード", type: "string", required: true, aliases: ["商品コード", "ItemCode", "JAN", "SKU"] },
  { key: "itemName", label: "商品名", type: "string", aliases: ["商品名", "ItemName"] },
  { key: "spec", label: "規格", type: "string", aliases: ["規格", "Spec"] },
  { key: "unit", label: "単位", type: "string", aliases: ["単位", "Unit"] },
  { key: "quantity", label: "数量", type: "int", required: true, aliases: ["数量", "Quantity", "Qty"] },
  { key: "unitPrice", label: "単価", type: "int", aliases: ["単価", "UnitPrice", "Price"] },
  { key: "remark", label: "明細備考", type: "string", aliases: ["摘要", "適用", "Remark"] },
];

export function fieldsFor(target: ImportTarget): FieldDef[] {
  switch (target) {
    case "ITEM":
      return ITEM_FIELDS;
    case "CUSTOMER":
      return CUSTOMER_FIELDS;
    case "SUPPLIER":
      return SUPPLIER_FIELDS;
    case "ORDER":
      return ORDER_FIELDS;
  }
}

/**
 * CSV のヘッダ配列に対し、各 FieldDef の aliases から最も近いものを推測する。
 * 完全一致 → 部分一致 の順。見つからない場合は null。
 */
export function autoMap(target: ImportTarget, headers: string[]): Record<string, string> {
  const fields = fieldsFor(target);
  const norm = (s: string) => s.replace(/[\s\u3000　\(\)（）\[\]［］]/g, "").toLowerCase();
  const normHeaders = headers.map((h) => ({ raw: h, n: norm(h) }));
  const out: Record<string, string> = {};
  for (const f of fields) {
    const candidates = [f.label, ...(f.aliases ?? []), f.key];
    let matched: string | null = null;
    for (const c of candidates) {
      const cn = norm(c);
      const hit = normHeaders.find((h) => h.n === cn);
      if (hit) {
        matched = hit.raw;
        break;
      }
    }
    if (!matched) {
      // 部分一致
      for (const c of candidates) {
        const cn = norm(c);
        const hit = normHeaders.find((h) => h.n.includes(cn) || cn.includes(h.n));
        if (hit) {
          matched = hit.raw;
          break;
        }
      }
    }
    if (matched) out[f.key] = matched;
  }
  return out;
}

/** 値の型変換 + バリデーション */
export function coerceValue(
  raw: string | undefined | null,
  type: FieldType
): { ok: true; value: any } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const s = String(raw).trim();
  if (s === "") return { ok: true, value: null };
  switch (type) {
    case "string":
      return { ok: true, value: s };
    case "int": {
      const cleaned = s.replace(/[,\s¥￥円]/g, "");
      if (!/^-?\d+$/.test(cleaned)) {
        return { ok: false, error: `"${s}" は整数ではありません` };
      }
      const n = Number(cleaned);
      if (!Number.isSafeInteger(n)) {
        return { ok: false, error: `"${s}" は扱える範囲の整数ではありません` };
      }
      return { ok: true, value: n };
    }
    case "bool": {
      if (/^(1|true|yes|y|t|○|◯|有|あり)$/i.test(s)) return { ok: true, value: true };
      if (/^(0|false|no|n|f|×|✕|無|なし|-)$/i.test(s)) return { ok: true, value: false };
      return { ok: false, error: `"${s}" を真偽値に変換できません` };
    }
    case "date": {
      let m: RegExpExecArray | null;
      if ((m = /^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?$/.exec(s)) ||
          (m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) {
        const [year, month, day] = [+m[1], +m[2], +m[3]];
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month &&
            date.getUTCDate() === day) {
          return { ok: true, value: date };
        }
      }
      return { ok: false, error: `"${s}" は正しい日付ではありません (YYYY-MM-DD 等)` };
    }
  }
}
