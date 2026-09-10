import type { DictionaryEntry } from "../shared/types";

/** BC/LCE/WCE share optional ungarbled text; this does not reverse speech transformations. */
export function receivedSpeech(content: string, type: string, dictionary: DictionaryEntry[]): string {
  if (type !== "Chat" && type !== "Whisper") return content;
  const original = dictionary.find(entry => typeof entry.Original === "string" && entry.Original.trim().length > 0 && entry.Original.length <= 10000)?.Original;
  if (typeof original !== "string" || original === content) return content;
  // Text only: downstream rendering uses textContent/linkification, never HTML or commands.
  return `${content} [${original}]`;
}
