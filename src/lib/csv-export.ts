export type CsvCell = string | number | boolean | null | undefined;

/**
 * Guard against spreadsheet formula execution. Quoting a cell with double-quotes
 * does not stop Excel/Sheets from evaluating a formula after importing CSV.
 * Explicitly prefix potentially dangerous text with an apostrophe.
 * Numeric values remain numeric (including legitimate negative quantities).
 */
export function protectCsvText(text: string): string {
  return /^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  if (!headers.length) throw new Error("CSV must contain at least one header");
  const cell = (value: CsvCell): string => {
    let s = value == null ? "" : typeof value === "string" ? protectCsvText(value) : String(value);
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const encode = (row: CsvCell[]) => row.map(cell).join(",");
  for (const row of rows) {
    if (row.length !== headers.length) throw new Error("CSV row width mismatch");
  }
  return "\uFEFF" + [encode(headers), ...rows.map(encode)].join("\r\n") + "\r\n";
}

export function exportTimestamp(d: Date | null | undefined): string {
  return d ? d.toISOString() : "";
}

export function exportDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}
