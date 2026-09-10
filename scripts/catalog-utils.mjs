import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** A locale contains only differences from English, including locale-only keys. */
export function localeDelta(base, localized) {
  return Object.fromEntries(Object.entries(localized).filter(([key, text]) => text !== base[key]));
}
export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
export function writeCatalog(directory, base, localized) {
  writeJson(`${directory}/en.json`, base);
  writeJson(`${directory}/zh.json`, localeDelta(base, localized));
}

export function bcCategory(key) {
  if (key.startsWith('Asset.')) return 'items';
  if (key.startsWith('Group.')) return 'groups';
  if (/^(?:ChatOther-|ChatSelf-|Action|Activity)/.test(key)) return 'actions';
  return 'messages';
}

export function writeBcCatalog(base, localized) {
  for (const category of ['messages', 'actions', 'items', 'groups']) {
    const select = data => Object.fromEntries(Object.entries(data).filter(([key]) => bcCategory(key) === category));
    writeCatalog(`src/translations/bc/${category}`, select(base), select(localized));
  }
}
