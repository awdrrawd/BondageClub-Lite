export type TextCatalog = Record<string, string>;
/** Number keys reference the English base's key order; strings are locale-only additions. */
export type PackedDelta = Array<[number | string, string]>;
export function mergeCatalog(base: TextCatalog, delta: PackedDelta = []): TextCatalog {
  const keys = Object.keys(base);
  return Object.fromEntries([
    ...Object.entries(base),
    ...delta.map(([key, text]): [string, string] => {
      if (typeof key === "number" && (!Number.isSafeInteger(key) || key < 0 || key >= keys.length)) throw new Error("Invalid catalog index");
      return [typeof key === "number" ? keys[key] : key, text];
    }),
  ]);
}
