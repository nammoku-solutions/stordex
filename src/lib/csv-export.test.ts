import { describe, expect, it } from "vitest";
import { toCsv, protectCsvText, exportTimestamp, exportDate } from "./csv-export";

describe("CSV export encoder", () => {
  it("uses UTF-8 BOM, RFC4180 escaping, and CRLF", () => {
    expect(toCsv(["name", "qty"], [['ACME, "Osaka"\nBranch', 4]]))
      .toBe('\uFEFFname,qty\r\n"ACME, ""Osaka""\nBranch",4\r\n');
  });

  it("protects spreadsheet formula cells but preserves numeric negatives", () => {
    const csv=toCsv(["item", "delta"], [
      ["=HYPERLINK(\"x\")", -2],
      ["  +SUM(A1:A2)", 3],
      ["@bad", 1],
      ["-remote", 1],
    ]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain(", -2");
    expect(csv).toContain(",-2");
    expect(csv).toContain("'  +SUM(A1:A2)");
    expect(csv).toContain("'@bad");
    expect(protectCsvText("normal")).toBe("normal");
  });

  it("rejects column count mismatches", () => {
    expect(() => toCsv(["code", "name"], [["only one"]])).toThrow();
  });

  it("exports stable date/timestamp values", () => {
    const d = new Date("2026-10-16T03:22:15.000Z");
    expect(exportDate(d)).toBe("2026-10-16");
    expect(exportTimestamp(d)).toBe("2026-10-16T03:22:15.000Z");
    expect(exportTimestamp(null)).toBe("");
  });
});
