/** One same-origin text-only chunk, fetched after login and cached by the module loader. */
export async function loadTextCatalog(locale: "zh" | "en" = "zh"): Promise<Record<string, string>> {
  return locale === "en" ? (await import("./data/bc-messages-en.json")).default : (await import("./data/bc-messages.json")).default;
}
