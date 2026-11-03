/**
 * Issue #62 — immutable, portable evidence for a proposed inventory cutover.
 *
 * No database queries or writes. A SHA-256 checksum is a tamper-detection aid,
 * NOT a signature or proof the two exports were captured atomically.
 */
import { createHash } from "node:crypto";
import { decodeCsvBuffer, parseCsv } from "./parse";
import {
  preflightInventoryLedgerExports,
  type InventoryLedgerPreflight,
} from "./inventory-ledger-preflight";

export const CUTOVER_MANIFEST_FORMAT = "stordex-inventory-cutover-v1" as const;

export type CutoverItem = {
  code: string;
  cutoverStock: number;
  history: "RECONCILED_LEDGER" | "CUTOVER_ONLY_NO_HISTORY";
  movementCount: number;
  inferredHistoricalOpening: number | null;
  lastHistoricalBalance: number | null;
};

export type InventoryCutoverManifest = {
  format: typeof CUTOVER_MANIFEST_FORMAT;
  manifestId: string;
  generatedAt: string;
  tenantFingerprint: string;
  source: {
    itemsCsvSha256: string;
    movementsCsvSha256: string;
  };
  checks: {
    itemCount: number;
    movementCount: number;
    reconciledItems: number;
    unverifiedItems: number;
    currentStockTotal: number;
    inferredHistoricalOpeningTotal: number;
  };
  cutover: {
    status: "NOT_CONFIRMED";
    atomicSnapshotVerified: false;
    businessWritesPausedVerified: false;
    requiresManualCutoverApproval: true;
  };
  items: CutoverItem[];
};

export type InventoryCutoverResult = {
  audit: InventoryLedgerPreflight;
  manifest: InventoryCutoverManifest | null;
};

function sha256(input: Uint8Array | string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Only build a manifest from the very same byte buffers being hashed.
 * This prevents a caller from validating one CSV but fingerprinting another.
 *
 * generatedAt describes when this report was CREATED; it is NOT the business
 * stock cutover time and must not be used as one.
 */
export function createInventoryCutoverManifest(input: {
  tenantId: string;
  itemsCsv: Uint8Array;
  movementsCsv: Uint8Array;
  generatedAt?: Date;
}): InventoryCutoverResult {
  if (!input.tenantId.trim()) throw new Error("Tenant identity is required");
  const read = (bytes: Uint8Array) =>
    parseCsv(decodeCsvBuffer(bytes, "utf-8").text);
  const audit = preflightInventoryLedgerExports({
    items: read(input.itemsCsv),
    movements: read(input.movementsCsv),
  });
  if (!audit.ok) return { audit, manifest: null };

  const itemsCsvSha256 = sha256(input.itemsCsv);
  const movementsCsvSha256 = sha256(input.movementsCsv);
  const tenantFingerprint = sha256("stordex:tenant:" + input.tenantId);
  const manifestId = sha256(JSON.stringify([
    CUTOVER_MANIFEST_FORMAT,
    tenantFingerprint,
    itemsCsvSha256,
    movementsCsvSha256,
  ]));
  const items: CutoverItem[] = audit.summaries
    .map(item => ({
      code: item.code,
      cutoverStock: item.currentStock,
      history: item.movementCount === 0
        ? "CUTOVER_ONLY_NO_HISTORY" as const
        : "RECONCILED_LEDGER" as const,
      movementCount: item.movementCount,
      inferredHistoricalOpening: item.inferredOpening,
      lastHistoricalBalance: item.lastBalance,
    }))
    .sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

  return {
    audit,
    manifest: {
      format: CUTOVER_MANIFEST_FORMAT,
      manifestId,
      generatedAt: (input.generatedAt ?? new Date()).toISOString(),
      tenantFingerprint,
      source: { itemsCsvSha256, movementsCsvSha256 },
      checks: {
        itemCount: audit.itemCount,
        movementCount: audit.movementCount,
        reconciledItems: audit.reconciledItems,
        unverifiedItems: audit.unverifiedItems,
        currentStockTotal: audit.sourceStockTotal,
        inferredHistoricalOpeningTotal: audit.openingStockTotal,
      },
      cutover: {
        status: "NOT_CONFIRMED",
        atomicSnapshotVerified: false,
        businessWritesPausedVerified: false,
        requiresManualCutoverApproval: true,
      },
      items,
    },
  };
}