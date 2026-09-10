// Only collect known literal plugin dialogues, never execute third-party code.
import { readFileSync } from 'node:fs';
import { writeJson } from './catalog-utils.mjs';
const entries = [];
const rules = JSON.parse(readFileSync('src/action/extension-rules.json','utf8'));
for (const source of ['echo', 'xiaosu', 'lscg']) {
  const catalog = JSON.parse(readFileSync(`src/translations/action/${source}/en.json`, 'utf8'));
  for (const key of Object.keys(catalog)) {
    const match = key.match(/^Chat(Other|Self)-(Item\w+)-(.+)$/);
    if (match) entries.push({ key, source, self: match[1] === 'Self', group: match[2], name: match[3], ...(rules[`${source}:${match[3]}`] ? {prerequisites:rules[`${source}:${match[3]}`]} : {}) });
  }
}
writeJson('src/action/extension-data.json', entries);
console.log(`${entries.length} dialogue-only extension options`);
