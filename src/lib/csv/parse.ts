/**
 * RFC4180 互換 CSV パーサ + 文字コード判定。
 * 業務 CSV (Shift_JIS / CP932 / UTF-8 BOM 付き) を吸収する。
 */

/**
 * バッファから文字コードを判定して文字列化する。
 * - encoding="auto": UTF-8 で復号して "REPLACEMENT CHARACTER" が一定割合
 *   含まれれば Shift_JIS にフォールバック
 */
export function decodeCsvBuffer(
  buf: Uint8Array,
  encoding: "auto" | "utf-8" | "shift_jis" | "cp932" = "auto"
): { text: string; encoding: "utf-8" | "shift_jis" } {
  const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

  if (encoding === "shift_jis" || encoding === "cp932") {
    const text = new TextDecoder("shift_jis").decode(buf);
    return { text: stripBom(text), encoding: "shift_jis" };
  }
  if (encoding === "utf-8") {
    const text = new TextDecoder("utf-8").decode(buf);
    return { text: stripBom(text), encoding: "utf-8" };
  }

  // auto
  const utfText = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const replacementCount = (utfText.match(/\uFFFD/g) ?? []).length;
  // バッファ内の非 ASCII バイトに対して replacement が多ければ Shift_JIS
  const nonAscii = buf.reduce((acc, b) => (b > 0x7f ? acc + 1 : acc), 0);
  if (nonAscii > 0 && replacementCount / nonAscii > 0.05) {
    const sjis = new TextDecoder("shift_jis").decode(buf);
    return { text: stripBom(sjis), encoding: "shift_jis" };
  }
  return { text: stripBom(utfText), encoding: "utf-8" };
}

/**
 * RFC4180 ベースの CSV パーサ。
 * ダブルクォート内のカンマ・改行・"" エスケープに対応。
 * 区切り文字は引数で指定可（", | \t | ;"）。
 */
export function parseCsv(text: string, delimiter: string = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  const len = text.length;
  let i = 0;
  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // \r\n か単独 \r
      if (text[i + 1] === "\n") i += 2;
      else i += 1;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  // 末尾
  if (cur !== "" || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  // 完全に空の行は除去（末尾の空行など）
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

/**
 * CSV を逆向きに（行配列から）テキストにシリアライズする。
 * クォート規則: "区切り文字 / 改行 / ダブルクォート" を含めばクォート、内部の " は "" にエスケープ。
 */
export function stringifyCsv(rows: string[][], delimiter: string = ","): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell ?? "";
          if (s.includes(delimiter) || s.includes("\n") || s.includes("\r") || s.includes('"')) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(delimiter)
    )
    .join("\r\n");
}
