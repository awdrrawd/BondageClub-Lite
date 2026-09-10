import { t } from "../i18n";
import LZString from "lz-string";

/** BC OnlineProfile uses U+256C + LZ-String UTF16; old profiles are plain text. */
export function decodeBiography(value: unknown): string {
  if (typeof value !== "string" || !value) return t("m242");
  if (!value.startsWith("\u256c")) return value.slice(0, 10000);
  if (value.length > 20000) return t("m243");
  try {
    const decoded = LZString.decompressFromUTF16(value.slice(1));
    return decoded === null ? t("m244") : decoded.slice(0, 10000) || t("m242");
  } catch { return t("m244"); }
}
