/**
 * Build read-only historical purchase-order evidence from an exported PO CSV.
 *
 * No ORM imports. Every row is validated against the supported Stordex export
 * format. PO numbers and all source lines remain historical snapshots, never
 * operational orders or receipts.
 */
import { createHash } from "node:crypto";
import { decodeCsvBuffer, parseCsv } from "./parse";
import { preflightPurchaseOrderExport } from "./purchase-order-preflight";

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Stable comparison even after PostgreSQL jsonb reorders object keys. */
export function canonicalArchiveJson(value: unknown): string {
  function ordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(ordered);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        ).map(([key, inner]) => [key, ordered(inner)]),
      );
    }
    return value;
  }
  return JSON.stringify(ordered(value));
}

export type PurchaseOrderArchiveSnapshot = {
  sourcePoNumber: string;
  sourceSha256: string;
  snapshot: ReturnType<typeof preflightPurchaseOrderExport>["documents"][number];
};

export function preparePurchaseOrderArchive(input: {
  csv: Uint8Array;
  itemCodes: readonly string[];
}): {
  sourceCsvSha256: string;
  documents: PurchaseOrderArchiveSnapshot[];
  warnings: number;
} {
  if (input.csv.byteLength > 10 * 1024 * 1024) {
    throw new Error("仕入発注CSVが隔離検証のサイズ上限を超えています");
  }
  // Reject corrupt UTF-8 rather than silently replacing characters with U+FFFD.
  new TextDecoder("utf-8", { fatal: true }).decode(input.csv);
  const source = parseCsv(decodeCsvBuffer(input.csv, "utf-8").text);
  const preflight = preflightPurchaseOrderExport(source);
  if (!preflight.ok) {
    throw new Error("仕入発注CSVの事前検証がFAILしました。履歴は保存されません");
  }
  if (preflight.documentCount > 1000) {
    throw new Error("隔離検証の仕入発注は1,000伝票までです");
  }

  const known = new Set(input.itemCodes);
  for (const doc of preflight.documents) {
    for (const line of doc.lines) {
      if (!known.has(line.itemCode)) {
        throw new Error(
          "仕入発注CSVに商品マスタに存在しない商品コードがあります: " + line.itemCode,
        );
      }
    }
  }
  return {
    sourceCsvSha256: sha256(input.csv),
    documents: preflight.documents.map(snapshot => ({
      sourcePoNumber: snapshot.poNumber,
      sourceSha256: sha256(canonicalArchiveJson(snapshot)),
      snapshot,
    })),
    warnings: preflight.warnings.length,
  };
}
