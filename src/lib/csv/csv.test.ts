import { describe, it, expect } from "vitest";
import { parseCsv, stringifyCsv, decodeCsvBuffer } from "./parse";
import { autoMap, coerceValue } from "./schema";

describe("parseCsv", () => {
  it("parses simple csv", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("handles quoted fields with comma and newline", () => {
    const csv = `name,note\n"佐藤, 太郎","line1\nline2"`;
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["佐藤, 太郎", "line1\nline2"],
    ]);
  });
  it("handles double-quote escape", () => {
    expect(parseCsv(`a,"b ""quoted"" c"`)).toEqual([["a", `b "quoted" c`]]);
  });
  it("handles CRLF and trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("supports tab delimiter", () => {
    expect(parseCsv("a\tb\n1\t2", "\t")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("stringifyCsv", () => {
  it("round-trips with quoting", () => {
    const rows = [
      ["a", "b", "c"],
      ["1", "x,y", `he said "hi"`],
    ];
    const text = stringifyCsv(rows);
    expect(parseCsv(text)).toEqual(rows);
  });
});

describe("decodeCsvBuffer", () => {
  it("decodes utf-8 with BOM", () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x2c, 0x62]);
    const r = decodeCsvBuffer(bom);
    expect(r.text).toBe("a,b");
    expect(r.encoding).toBe("utf-8");
  });
  it("forces shift_jis", () => {
    // "あ" in Shift_JIS = 82 A0
    const buf = new Uint8Array([0x82, 0xa0]);
    const r = decodeCsvBuffer(buf, "shift_jis");
    expect(r.text).toBe("あ");
    expect(r.encoding).toBe("shift_jis");
  });
});

describe("autoMap", () => {
  it("matches header by alias for ITEM", () => {
    const m = autoMap("ITEM", ["商品コード", "商品名", "単位", "売価"]);
    expect(m.code).toBe("商品コード");
    expect(m.name).toBe("商品名");
    expect(m.unit).toBe("単位");
    expect(m.salesPrice).toBe("売価");
  });
});

describe("coerceValue", () => {
  it("parses int with yen sign", () => {
    expect(coerceValue("¥1,500", "int")).toEqual({ ok: true, value: 1500 });
  });
  it("rejects bad int", () => {
    const r = coerceValue("abc", "int");
    expect(r.ok).toBe(false);
  });
  it("parses YYYY/MM/DD date", () => {
    const r = coerceValue("2026/01/02", "date") as any;
    expect(r.ok).toBe(true);
    expect(r.value.getUTCFullYear()).toBe(2026);
  });
  it("parses bool variations", () => {
    expect(coerceValue("○", "bool")).toEqual({ ok: true, value: true });
    expect(coerceValue("×", "bool")).toEqual({ ok: true, value: false });
  });
  it("treats empty as null", () => {
    expect(coerceValue("", "string")).toEqual({ ok: true, value: null });
  });
});
