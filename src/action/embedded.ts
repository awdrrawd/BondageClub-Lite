import type { DictionaryEntry } from "../shared/types";

/** LSCG SendAction sends already-rendered text through Beep -> msg -> text.
 * Treat the payload as literal: recursively replacing dictionary tags would
 * corrupt player names or sentences containing words such as "msg" or "Beep".
 */
export function literalAction(content: string, type: string, dictionary: DictionaryEntry[]): string | undefined {
  if (type !== "Action" || content !== "Beep") return undefined;
  if (!dictionary.some(entry => entry.Tag === "Beep" && entry.Text === "msg")) return undefined;
  const message = dictionary.find(entry => entry.Tag === "msg" && typeof entry.Text === "string" && entry.Text.length <= 20000);
  return message?.Text;
}

/** XiaoSuActivity, LSCG, BCX and custom activity senders embed a vanilla-compatible fallback. */
export function embeddedAction(content: string, type: string, dictionary: DictionaryEntry[]): string | undefined {
  if (!["Action", "Activity", "ServerMessage"].includes(type)) return undefined;
  const files = type === "Activity" ? ["ActivityDictionary.csv", "Interface.csv"] : ["Interface.csv", "Text_ChatRoom.csv"];
  const tags = files.map(file => `MISSING TEXT IN "${file}": ${content}`);
  const entry = dictionary.find(value => typeof value.Tag === "string" && tags.includes(value.Tag) && typeof value.Text === "string" && value.Text.length <= 20000);
  return entry?.Text;
}
