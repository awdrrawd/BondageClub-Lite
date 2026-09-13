import { t } from "../i18n";
import type { DictionaryEntry } from "../shared/types";
import { embeddedAction, literalAction } from "./embedded";
export function dictionaryText(entry: DictionaryEntry): string | null {
  if (typeof entry.Text === "string") return entry.Text;
  if (typeof entry.CharacterName === "string") return entry.CharacterName;
  if (typeof entry.Name === "string") return entry.Name;
  if (typeof entry.AssetName === "string") return entry.AssetName;
  return null;
}

export function formatServerText(content: string, dictionary: DictionaryEntry[] = []): string {
  const replacements = new Map<string, string>();
  for (const entry of dictionary) {
    if (typeof entry.Tag !== "string" || !entry.Tag || entry.Tag.length > 300) continue;
    const replacement = dictionaryText(entry);
    if (replacement !== null) replacements.set(entry.Tag, replacement);
  }
  const keys = [...replacements.keys()].sort((a, b) => b.length - a.length).map(key => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return keys.length ? content.replace(new RegExp(keys.join("|"), "g"), key => replacements.get(key)!) : content;
}

export function renderAction(content: string, type: string, dictionary: DictionaryEntry[], catalog: Record<string, string>): string {
    const literal = literalAction(content, type, dictionary);
    if (literal !== undefined) return literal;
    const key = type === "ServerMessage" ? `ServerMessage${content}` : content;
    const fallback = content === "ActionUse" ? t("action.use") : content === "ActionRemove" ? t("action.remove") : content === "ActionSwap" ? t("action.swap") : content;
    const template = (/-LSCG_/.test(content) && Object.hasOwn(catalog, content) ? catalog[content] : undefined) ?? embeddedAction(content, type, dictionary) ?? (Object.hasOwn(catalog, key) ? catalog[key] : Object.hasOwn(catalog, content) ? catalog[content] : fallback);
    const entries = dictionary.map(entry => {
      const group = entry.GroupName ?? entry.AssetGroupName;
      if (entry.Tag && typeof entry.TextToLookUp === "string") return { ...entry, Text: catalog[entry.TextToLookUp] || entry.TextToLookUp };
      if (entry.Tag && typeof entry.AssetName === "string") {
        const name = catalog[`Asset.${group}.${entry.AssetName}`] || entry.AssetName;
        return { ...entry, Text: typeof entry.CraftName === "string" && entry.CraftName ? entry.CraftName : name };
      }
      if (entry.Tag && typeof group === "string" && !entry.Text) return { ...entry, Text: catalog[`Group.${group}`] || group };
      return entry;
    });
    const focus = dictionary.find(entry => typeof entry.FocusGroupName === "string" || (!entry.Tag && typeof entry.AssetGroupName === "string"));
    if (focus) {
      const group = String(focus.FocusGroupName || focus.AssetGroupName);
      entries.push({ Tag: "FocusAssetGroup", Text: catalog[`Group.${group}`] || group });
    }
    return formatServerText(template, entries);
  }
