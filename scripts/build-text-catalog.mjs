// Mechanical conversion of BC text resources; no BC executable code or images.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
    const lines = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(line => !line.startsWith('###')).map(line => line.trim());
    const result = new Map();
    for (let i = 0; i + 1 < lines.length; i++) if (lines[i] && !result.has(lines[i])) result.set(lines[i], lines[i + 1]);
    return result;
  } catch (error) { if (error.code === 'ENOENT') return new Map(); throw error; }
}
const catalog = {};
const englishCatalog = {};
for (const file of ['Screens/Interface', 'Assets/Female3DCG/AssetStrings', 'Screens/Online/ChatRoom/Text_ChatRoom', 'Screens/Character/Preference/ActivityDictionary']) {
  const cn = translation(resolve(root, file + '_CN.txt'));
  const tw = translation(resolve(root, file + '_TW.txt'));
  for (const [key, english] of csv(readFileSync(resolve(root, file + '.csv'), 'utf8'))) {
    if (key && english) { catalog[key] = tw.get(english.trim()) || cn.get(english.trim()) || english; englishCatalog[key] = english; }
  }
}
const assetFile = 'Assets/Female3DCG/Female3DCG';
const cnAssets = translation(resolve(root, assetFile + '_CN.txt'));
const twAssets = translation(resolve(root, assetFile + '_TW.txt'));
for (const [group, asset, english] of csv(readFileSync(resolve(root, assetFile + '.csv'), 'utf8'))) {
  if (!group || !english) continue;
  const key = asset ? `Asset.${group}.${asset}` : `Group.${group}`;
  catalog[key] = twAssets.get(english.trim()) || cnAssets.get(english.trim()) || english;
  englishCatalog[key] = english;
}
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/bc-messages.json', JSON.stringify(catalog));
writeFileSync('src/data/bc-messages-en.json', JSON.stringify(englishCatalog));
console.log(`Generated ${Object.keys(catalog).length} text entries`);
