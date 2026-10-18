// Mechanical conversion of BC text resources; no BC executable code or images.
import { readFileSync, existsSync } from 'node:fs';
import { parseBcTranslations, bcTranslation, legacyTextSource } from './bc-text-format.mjs';
import { bcTextLocales } from './bc-text-locales.mjs';
import { writeBcCatalog, writeJson, bcCategory, localeDelta } from './catalog-utils.mjs';
import { resolve } from 'node:path';
const root = resolve(process.argv[2] || '../BCJS/Bondage-College-master/BondageClub');
function csv(source) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (char === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function translation(path) {
  try {
    return parseBcTranslations(readFileSync(path, 'utf8'));
  } catch (error) { if (error.code === 'ENOENT') return new Map(); throw error; }
}
const catalog = {};
const englishCatalog = {};
const russianCatalog = {};
const additionalLocales = Object.fromEntries(Object.entries(bcTextLocales).filter(([locale]) => !['zh', 'ru'].includes(locale)));
const additionalCatalogs = Object.fromEntries(Object.keys(additionalLocales).map(locale => [locale, {}]));
function additionalTranslations(file) {
  return Object.fromEntries(Object.entries(additionalLocales).map(([locale, suffix]) => [locale, translation(resolve(root, file + '_' + suffix + '.txt'))]));
}
function collectAdditional(key, english, translations) {
  for (const [locale, dictionary] of Object.entries(translations)) {
    const translated = bcTranslation(dictionary, key, english);
    if (validTranslation(english, translated)) additionalCatalogs[locale][key] = translated;
  }
}
// Invalid upstream substitutions fall back to English instead of losing actors or item names.
function validTranslation(english, translated) {
  if(!translated)return false;
  const tokens=text=>[...new Set(text.match(/\b(?:SourceCharacter|DestinationCharacter|TargetCharacter(?:Name)?|FocusAssetGroup|ActivityAsset|PrevAsset|NextAsset|(?:Target)?Pronoun(?:Possessive|Subject|Object|Self))\b/g) || [])].sort().join('|');
  return tokens(english)===tokens(translated);
}
for (const source of ['Screens/Interface', 'Assets/AssetStrings', 'Screens/Online/ChatRoom/Text_ChatRoom', 'Screens/Character/Preference/ActivityDictionary']) {
  const file = existsSync(resolve(root, source + '.csv')) ? source : (legacyTextSource(source) || source);
  const translations = additionalTranslations(file);
  const ru = translation(resolve(root, file + '_RU.txt'));
  const cn = translation(resolve(root, file + '_CN.txt'));
  const tw = translation(resolve(root, file + '_TW.txt'));
  for (const [key, english] of csv(readFileSync(resolve(root, file + '.csv'), 'utf8'))) {
    if (key && english) { catalog[key] = [bcTranslation(tw, key, english), bcTranslation(cn, key, english)].find(value => validTranslation(english, value)) || english; englishCatalog[key] = english; const translated=bcTranslation(ru, key, english); if(validTranslation(english,translated))russianCatalog[key]=translated; collectAdditional(key, english, translations); }
  }
}
const assetFile = existsSync(resolve(root, 'Assets/Female3DCG.csv')) ? 'Assets/Female3DCG' : 'Assets/Female3DCG/Female3DCG';
const additionalAssets = additionalTranslations(assetFile);
const ruAssets = translation(resolve(root, assetFile + '_RU.txt'));
const cnAssets = translation(resolve(root, assetFile + '_CN.txt'));
const twAssets = translation(resolve(root, assetFile + '_TW.txt'));
for (const [group, asset, english] of csv(readFileSync(resolve(root, assetFile + '.csv'), 'utf8'))) {
  if (!group || !english) continue;
  const key = asset ? `Asset.${group}.${asset}` : `Group.${group}`;
  catalog[key] = twAssets.get(english.trim()) || cnAssets.get(english.trim()) || english;
  englishCatalog[key] = english;
  const translated=ruAssets.get(english.trim());if(validTranslation(english,translated))russianCatalog[key]=translated;
  collectAdditional(key, english, additionalAssets);
}
// Missing optional files (or individual untranslated entries) must not erase
// existing translations. Only retain entries whose English source is unchanged;
// changed/removed source keys must not inherit a potentially stale translation.
// Read every previous base before writeBcCatalog replaces any files.
for (const category of ['messages', 'actions', 'items', 'groups']) {
  const directory = `src/translations/bc/${category}`;
  const read = file => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const previousEnglish = read(`${directory}/en.json`);
  for (const [locale, dictionary] of Object.entries({ zh: catalog, ru: russianCatalog, ...additionalCatalogs })) {
    for (const [key, text] of Object.entries(read(`${directory}/${locale}.json`))) {
      if (Object.hasOwn(englishCatalog, key) && previousEnglish[key] === englishCatalog[key]
        && (!Object.hasOwn(dictionary, key) || dictionary[key] === englishCatalog[key])) dictionary[key] = text;
    }
  }
}
writeBcCatalog(englishCatalog, catalog);
for(const category of ['messages','actions','items','groups']) {
  const delta=localeDelta(englishCatalog,russianCatalog);
  writeJson('src/translations/bc/'+category+'/ru.json',Object.fromEntries(Object.entries(delta).filter(([key])=>bcCategory(key)===category)));
}
console.log('Russian translations: '+Object.keys(russianCatalog).length);
for (const [locale, dictionary] of Object.entries(additionalCatalogs)) {
  const delta = localeDelta(englishCatalog, dictionary);
  for (const category of ['messages', 'actions', 'items', 'groups']) {
    writeJson(`src/translations/bc/${category}/${locale}.json`, Object.fromEntries(Object.entries(delta).filter(([key]) => bcCategory(key) === category)));
  }
  console.log(`${locale} translations: ${Object.keys(delta).length}`);
}
console.log(`Generated ${Object.keys(catalog).length} text entries`);
