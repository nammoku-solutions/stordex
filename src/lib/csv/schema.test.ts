import { describe, expect, it } from "vitest";
import { coerceValue, autoMap } from "./schema";
import { parseCsv, decodeCsvBuffer } from "./parse";

describe("CSV import validation", () => {
  it("refuses noninteger quantities and overflow", () => {
    expect(coerceValue("2.5", "int").ok).toBe(false);
    expect(coerceValue("abc", "int").ok).toBe(false);
    expect(coerceValue("9007199254740993", "int").ok).toBe(false);
    expect(coerceValue("1,234", "int")).toEqual({ ok: true, value: 1234 });
  });
  it("does not silently roll invalid calendar dates forward", () => {
    expect(coerceValue("2026-02-30", "date").ok).toBe(false);
    expect(coerceValue("2026/10/16", "date")).toEqual({
      ok: true, value: new Date("2026-10-16T00:00:00.000Z"),
    });
  });
  it("parses quoted commas and multiline fields", () => {
    expect(parseCsv('code,name\r\nA,"One, Two"\r\nB,"line1\nline2"\r\n'))
      .toEqual([["code", "name"], ["A", "One, Two"], ["B", "line1\nline2"]]);
  });
  it("recognizes existing Japanese columns for external orders", () => {
    const mapping = autoMap("ORDER", ["受注番号", "得意先コード", "商品コード", "数量"]);
    expect(mapping).toMatchObject({
      orderNumber: "受注番号",
      customerCode: "得意先コード",
      itemCode: "商品コード",
      quantity: "数量",
    });
  });
  it("decodes UTF-8 BOM text", () => {
    const input = new TextEncoder().encode("\uFEFF商品コード,商品名\r\nA,商品\r\n");
    expect(decodeCsvBuffer(input).text.startsWith("商品コード")).toBe(true);
  });
});
