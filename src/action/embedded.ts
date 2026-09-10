import type { DictionaryEntry } from "../shared/types";
/** XiaoSuActivity, LSCG, BCX and custom activity senders embed a vanilla-compatible fallback. */
export function embeddedAction(content: string, type: string, dictionary: DictionaryEntry[]): string | undefined {
  if (!["Action", "Activity", "ServerMessage"].includes(type)) return undefined;
  const files = type === "Activity" ? ["ActivityDictionary.csv", "Interface.csv"] : ["Interface.csv", "Text_ChatRoom.csv"];
  const tags = files.map(file => `MISSING TEXT IN "${file}": ${content}`);
  const entry = dictionary.find(value => typeof value.Tag === "string" && tags.includes(value.Tag) && typeof value.Text === "string" && value.Text.length <= 20000);
  return entry?.Text;
}
