/** One same-origin text-only chunk, fetched after login and cached by the module loader. */
export async function loadTextCatalog(): Promise<Record<string, string>> {
  return (await import("./data/bc-messages.json")).default;
}
