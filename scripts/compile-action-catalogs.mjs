import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localeDelta, writeJson } from './catalog-utils.mjs';

export function readDictionary(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (!data || Array.isArray(data) || typeof data !== 'object' || Object.values(data).some(value => typeof value !== 'string' || !value.trim())) throw new Error(`Invalid text dictionary: ${file}`);
  return data;
}
/** Compile all sources to one base and sparse per-locale deltas. Overrides are hand maintained. */
export function compileCatalogs(root = resolve('src/translations')) {
  const discover = directory => {
    if (!existsSync(directory)) return [];
    const leaves = existsSync(join(directory, 'en.json')) ? [directory] : [];
    return [...leaves, ...readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => discover(join(directory, entry.name)))];
  };
  const sources = ['bc', 'action', 'items', 'groups'].flatMap(folder => discover(join(root, folder)));
  if (!sources.length) throw new Error('No English catalog sources found');
  const locales = new Set(['en']);
  for (const directory of [...sources, join(root, 'overrides')]) for (const file of readdirSync(directory)) if (/^[a-z][a-z0-9-]*\.json$/.test(file)) locales.add(file.slice(0, -5));
  const dictionaries = Object.fromEntries(sources.map(directory => {
    const english = readDictionary(join(directory, 'en.json'));
    return [directory, { en: english, ...Object.fromEntries([...locales].filter(locale => locale !== 'en' && existsSync(join(directory, `${locale}.json`))).map(locale => [locale, readDictionary(join(directory, `${locale}.json`))])) }];
  }));
  const owners = new Map();
  for (const [directory, dictionary] of Object.entries(dictionaries)) for (const key of Object.keys(dictionary.en)) {
    if (owners.has(key)) throw new Error(`Duplicate action key ${key}: ${owners.get(key)} and ${directory}; use overrides for intentional replacements`);
    owners.set(key, directory);
  }
  const merged = {};
  for (const locale of locales) {
    const result = {};
    for (const dictionary of Object.values(dictionaries)) Object.assign(result, dictionary.en, dictionary[locale]);
    for (const language of new Set(['en', locale])) {
      const file = join(root, 'overrides', `${language}.json`);
      if (existsSync(file)) Object.assign(result, readDictionary(file));
    }
    merged[locale] = result;
  }
  return Object.fromEntries(Object.entries(merged).map(([locale, value]) => [locale, locale === 'en' ? value : localeDelta(merged.en, value)]));
}

export function packCatalogs(catalogs) {
  const indexes = new Map(Object.keys(catalogs.en).map((key, index) => [key, index]));
  return Object.fromEntries(Object.entries(catalogs).map(([locale, dictionary]) => [locale, locale === 'en' ? dictionary : Object.entries(dictionary).map(([key, text]) => [indexes.has(key) ? indexes.get(key) : key, text])]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve('src/action/generated');
  const catalogs = compileCatalogs();
  // Remove only stale generated locale JSON files, never source translations or directories.
  if (existsSync(output)) for (const file of readdirSync(output)) if (/^[a-z][a-z0-9-]*\.json$/.test(file) && !Object.hasOwn(catalogs, file.slice(0, -5))) rmSync(join(output, file));
  for (const [locale, dictionary] of Object.entries(packCatalogs(catalogs))) writeJson(join(output, `${locale}.json`), dictionary);
  console.log(`Action catalogs: ${Object.entries(catalogs).map(([locale, value]) => `${locale} ${Object.keys(value).length}`).join(', ')}`);
}
