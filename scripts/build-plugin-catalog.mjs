// Extract literal dialogue data only: never evaluate plugin source or load its runtime.
import { readFileSync, readdirSync } from 'node:fs';
import { writeCatalog } from './catalog-utils.mjs';
import { join } from 'node:path';
import { parse } from '@babel/parser';
const catalogs = { zh: {}, en: {} };
function literal(node) {
  if (!node) return undefined;
  if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') return literal(node.expression);
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(literal);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.filter(p => p.type === 'ObjectProperty' && !p.computed).map(p => [p.key.name || p.key.value, literal(p.value)]));
}
function walk(node, callback) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ObjectExpression') callback(literal(node));
  for (const [key, value] of Object.entries(node)) if (!['loc', 'comments', 'tokens'].includes(key)) {
    if (Array.isArray(value)) value.forEach(n => walk(n, callback)); else if (value && typeof value === 'object') walk(value, callback);
  }
}
function scan(file, callback) { walk(parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['typescript'] }), callback); }
function add(locale, mode, group, name, text) {
  if ([group, name, text].every(v => typeof v === 'string' && v)) catalogs[locale][`Chat${mode}-${group}-${name}`] = text;
}
const xiao = Object.fromEntries(['zh', 'en'].map(locale => [locale, JSON.parse(readFileSync(`../XiaoSuActivity/translation/${locale === 'zh' ? 'TW' : 'EN'}.json`, 'utf8')).Activity]));
scan('../XiaoSuActivity/src/Modules/MActivity.ts', object => {
  if (!object.act?.Name?.startsWith('XSAct_')) return;
  const name = object.act.Name, key = name.slice(6);
  for (const locale of ['zh', 'en']) for (const [mode, targets, index] of [['Other', object.act.Target, 0], ['Self', object.act.TargetSelf, 1]]) {
    if (!Array.isArray(targets)) continue;
    for (const group of targets) {
      const text = xiao[locale][`${key}.Desc.${index}`];
      if (typeof text === 'string') add(locale, mode, group, name, text.replace(/\{([012])\}/g, (_, n) => ['SourceCharacter', 'TargetCharacter', xiao[locale][group] || group][n]));
    }
  }
});
scan('../BCJS/LSCG-main/src/Modules/activities.ts', object => {
  if (!object.Activity?.Name || !Array.isArray(object.Targets)) return;
  for (const target of object.Targets) if (target) for (const locale of ['zh', 'en']) {
    add(locale, 'Other', target.Name, `LSCG_${object.Activity.Name}`, target.TargetAction);
    if (target.SelfAllowed) add(locale, 'Self', target.Name, `LSCG_${object.Activity.Name}`, target.TargetSelfAction || target.TargetAction);
  }
});
function echo(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) echo(file);
    else if (entry.name.endsWith('.js')) scan(file, object => {
      if (!object.activity?.Name) return;
      for (const locale of ['zh', 'en']) for (const [mode, groups, dialogs] of [['Other', object.activity.Target, object.dialog], ['Self', object.activity.TargetSelf, object.dialogSelf]]) {
        if (!Array.isArray(groups)) continue;
        const text = typeof dialogs === 'string' ? dialogs : dialogs?.[locale === 'zh' ? 'CN' : 'EN'] || dialogs?.EN || dialogs?.CN;
        for (const group of groups) add(locale, mode, group, object.activity.Name, text);
      }
    });
  }
}
echo('../BCJS/echo-activity-ext-main/src/components');
for (const source of ['xiaosu', 'lscg', 'echo']) {
  const select = catalog => Object.fromEntries(Object.entries(catalog).filter(([key]) => (key.includes('-XSAct_') ? 'xiaosu' : key.includes('-LSCG_') ? 'lscg' : 'echo') === source));
  writeCatalog(`src/translations/action/${source}`, select(catalogs.en), select(catalogs.zh));
  console.log(`${source}: ${Object.keys(select(catalogs.en)).length} literal plugin dialogues`);
}
