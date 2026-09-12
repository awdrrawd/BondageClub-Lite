/** Generated text-only chunks: shared English base plus the selected locale's delta. */
import { mergeCatalog, type TextCatalog, type PackedDelta } from "./merge";
const chunks = import.meta.glob<TextCatalog | PackedDelta>("./generated/*.json", { import: "default" });
export async function loadTextCatalog(locale: "zh" | "en" | "ru" = "zh"): Promise<Record<string, string>> {
  const base = chunks["./generated/en.json"];
  if (!base) throw new Error("Missing action catalog; run npm run catalog:compile");
  const localized = locale === "en" ? undefined : chunks[`./generated/${locale}.json`];
  const [english, delta] = await Promise.all([base(), localized?.()]);
  return mergeCatalog(english as TextCatalog, delta as PackedDelta | undefined);
}
