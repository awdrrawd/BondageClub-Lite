import LZString from "lz-string";

/** BC OnlineProfile uses U+256C + LZ-String UTF16; old profiles are plain text. */
export function decodeBiography(value: unknown): string {
  if (typeof value !== "string" || !value) return "未提供個人描述";
  if (!value.startsWith("\u256c")) return value.slice(0, 10000);
  if (value.length > 20000) return "BIO 資料過大，無法顯示";
  try {
    const decoded = LZString.decompressFromUTF16(value.slice(1));
    return decoded === null ? "BIO 解壓失敗" : decoded.slice(0, 10000) || "未提供個人描述";
  } catch { return "BIO 解壓失敗"; }
}
