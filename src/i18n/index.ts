import zh from "../translations/ui/zh.json";
import en from "../translations/ui/en.json";

import ru from "../translations/ui/ru.json";

export type Locale = "zh" | "en" | "ru";
export type TextKey = keyof typeof zh;
const dictionaries: Record<Locale, Record<string, string>> = { zh, en, ru };
let locale: Locale = "zh";
export function getLocale(): Locale { return locale; }
export function setLocale(value: Locale): void { locale = value; }
export function t(key: TextKey, values: readonly unknown[] = []): string {
  const text = dictionaries[locale][key] ?? en[key] ?? zh[key];
  return text.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? `{${index}}`));
}

/** Re-localize known UI status strings, never user chat, BIO, room names or BEEP. */
export function localizeStatus(value: string): string {
  for (const language of ["zh", "en", "ru"] as const) {
    for (const [key, template] of Object.entries(dictionaries[language])) {
      const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const indexes: number[] = [];
      const pattern = escaped.replace(/\\\{(\d+)\\\}/g, (_, index) => { indexes.push(Number(index)); return "([\\s\\S]*?)"; });
      const match = new RegExp(`^${pattern}$`).exec(value);
      if (!match) continue;
      const params: string[] = []; indexes.forEach((index, i) => { params[index] = match[i + 1]; });
      return t(key as TextKey, params);
    }
  }
  return value;
}
