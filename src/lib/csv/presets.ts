/**
 * 同梱プリセット定義。
 * - GENERIC: ヘッダ自動推測のみのフォールバック
 * - LOGIGATE_ESHIP: ロジザード eShip の標準受注 CSV (代表的な列名)
 * - INFOMART_ORDER: BtoB プラットフォーム インフォマート 受注 CSV
 *
 * ※ 列名は公開情報からの代表値。導入先のフォーマットによっては
 *   画面上で列マッピングを一部上書きしてから「保存」してください。
 */

import type { ImportTarget } from "@prisma/client";

export interface BuiltInPreset {
  key: string;
  name: string;
  description: string;
  target: ImportTarget;
  encoding: "auto" | "utf-8" | "shift_jis";
  delimiter: string;
  headerRow: number;
  skipRows: number;
  upsertMode: "skip" | "update";
  mapping: Record<string, string>;
}

export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  // ---------- 汎用 ----------
  {
    key: "generic-item",
    name: "汎用 商品マスタ",
    description: "Excel で書き出した一般的な商品 CSV (UTF-8 / カンマ区切り)。列名は自動推測。",
    target: "ITEM",
    encoding: "auto",
    delimiter: ",",
    headerRow: 0,
    skipRows: 0,
    upsertMode: "update",
    mapping: {},
  },
  {
    key: "generic-customer",
    name: "汎用 得意先",
    description: "Excel で書き出した一般的な得意先 CSV。列名は自動推測。",
    target: "CUSTOMER",
    encoding: "auto",
    delimiter: ",",
    headerRow: 0,
    skipRows: 0,
    upsertMode: "update",
    mapping: {},
  },
  {
    key: "generic-supplier",
    name: "汎用 仕入先",
    description: "Excel で書き出した一般的な仕入先 CSV。列名は自動推測。",
    target: "SUPPLIER",
    encoding: "auto",
    delimiter: ",",
    headerRow: 0,
    skipRows: 0,
    upsertMode: "update",
    mapping: {},
  },
  {
    key: "generic-order",
    name: "汎用 受注",
    description: "Excel で書き出した一般的な受注 CSV。列名は自動推測。",
    target: "ORDER",
    encoding: "auto",
    delimiter: ",",
    headerRow: 0,
    skipRows: 0,
    upsertMode: "skip",
    mapping: {},
  },

  // ---------- Logigate eShip (ロジザード eShip 受注 CSV) ----------
  {
    key: "logigate-eship-order",
    name: "Logigate eShip 受注",
    description: "ロジザード eShip からエクスポートした受注 CSV (Shift_JIS)。",
    target: "ORDER",
    encoding: "shift_jis",
    delimiter: ",",
    headerRow: 0,
    skipRows: 0,
    upsertMode: "skip",
    mapping: {
      orderNumber: "受注番号",
      customerCode: "得意先コード",
      customerName: "得意先名",
      orderDate: "受注日",
      dueDate: "出荷日",
      orderer: "発注者",
      orderNote: "備考",
      itemCode: "商品コード",
      itemName: "商品名",
      unit: "単位",
      quantity: "数量",
      unitPrice: "単価",
      remark: "明細備考",
    },
  },

  // ---------- Infomart 受注 ----------
  {
    key: "infomart-order",
    name: "インフォマート 受注",
    description: "BtoB プラットフォーム (インフォマート) ダウンロード受注 CSV (Shift_JIS)。",
    target: "ORDER",
    encoding: "shift_jis",
    delimiter: ",",
    headerRow: 0,
    skipRows: 0,
    upsertMode: "skip",
    mapping: {
      orderNumber: "発注番号",
      customerCode: "発注企業コード",
      customerName: "発注企業名",
      orderDate: "発注日",
      dueDate: "納品日",
      orderer: "発注担当者",
      orderNote: "発注備考",
      itemCode: "商品コード",
      itemName: "商品名",
      spec: "規格",
      unit: "単位",
      quantity: "発注数量",
      unitPrice: "単価",
      remark: "明細摘要",
    },
  },
];

export function builtInPresetsFor(target: ImportTarget): BuiltInPreset[] {
  return BUILT_IN_PRESETS.filter((p) => p.target === target);
}

export function findBuiltInPreset(key: string): BuiltInPreset | null {
  return BUILT_IN_PRESETS.find((p) => p.key === key) ?? null;
}
