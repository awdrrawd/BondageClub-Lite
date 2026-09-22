import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const xiaosuLocales = { en: 'EN', zh: 'TW', 'zh-cn': 'CN', de: 'DE', fr: 'FR', ru: 'RU', uk: 'UA' };

/** Use the plugin's own labels and messages; only substitute its documented placeholders. */
export function xiaosuCatalog(keys, activity) {
  const result = {};
  for (const key of keys) {
    const match = key.match(/^(Label-)?Chat(Self|Other)-(Item\w+)-XSAct_(.+)$/);
    if (!match) continue;
    const [, label, mode, group, name] = match;
    const value = activity[label ? name : `${name}.Desc.${mode === 'Self' ? 1 : 0}`];
    if (typeof value === 'string' && value.trim()) result[key] = label ? value : value.replace(/\{([012])\}/g, (_, n) => ['SourceCharacter', 'TargetCharacter', activity[group] || group][n]);
  }
  return result;
}

export function readXiaosuCatalogs(keys, root = '../XiaoSuActivity/translation') {
  return Object.fromEntries(Object.entries(xiaosuLocales).map(([locale, file]) => [locale, xiaosuCatalog(keys, JSON.parse(readFileSync(join(root, `${file}.json`), 'utf8')).Activity)]));
}
