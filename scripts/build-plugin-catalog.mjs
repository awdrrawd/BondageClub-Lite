// Extract literal dialogue data only: never evaluate plugin source or load its runtime.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { writeCatalog, writeJson } from './catalog-utils.mjs';
import { readXiaosuCatalogs } from './xiaosu-catalog.mjs';
import { join } from 'node:path';
import { parse } from '@babel/parser';
import { expandActivityTemplate } from './activity-prerequisites.mjs';
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
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.object.name === 'ActivityExt' && node.callee.property.name === 'fromTemplateActivity') {
    const activities = literal(expandActivityTemplate(node.arguments[0]));
    const groups = literal(node.arguments[1]), template = literal(node.arguments[2]), tag = literal(node.arguments[3]) ?? '$group';
    if (groups && template) for (const entry of Array.isArray(activities) ? activities : [activities]) {
      if (!entry?.activity) continue;
      const result = { ...entry };
      for (const [key, translations] of Object.entries(template)) {
        const targets = key.includes('Self') && entry.activity.TargetSelf !== true ? entry.activity.TargetSelf : entry.activity.Target;
        if (!Array.isArray(targets)) continue;
        result[key] = Object.fromEntries(Object.entries(translations ?? {}).map(([lang, text]) => [lang, Object.fromEntries(targets.filter(group => groups[lang]?.[group] && typeof text === 'string').map(group => [group, text.replace(tag, groups[lang][group])]))]));
      }
      if (result.activity.TargetSelf === true) result.activity = { ...result.activity, TargetSelf: result.activity.Target };
      result.dialogSelf ??= result.dialog;
      callback(result);
    }
    return;
  }
  if (node.type === 'ObjectExpression') callback(literal(node));
  for (const [key, value] of Object.entries(node)) if (!['loc', 'comments', 'tokens'].includes(key)) {
    if (Array.isArray(value)) value.forEach(n => walk(n, callback)); else if (value && typeof value === 'object') walk(value, callback);
  }
}
function scan(file, callback) { walk(parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['typescript'] }), callback); }
function add(locale, mode, group, name, text) {
  if ([group, name, text].every(v => typeof v === 'string' && v)) catalogs[locale][`Chat${mode}-${group}-${name}`] = text;
}
function label(locale, mode, group, name, text) {
  if ([group, name, text].every(v => typeof v === 'string' && v)) catalogs[locale][`Label-Chat${mode}-${group}-${name}`] = text;
}
const xiao = Object.fromEntries(['zh', 'en'].map(locale => [locale, JSON.parse(readFileSync(`../XiaoSuActivity/translation/${locale === 'zh' ? 'TW' : 'EN'}.json`, 'utf8')).Activity]));
scan('../XiaoSuActivity/src/Modules/MActivity.ts', object => {
  if (!object.act?.Name?.startsWith('XSAct_')) return;
  const name = object.act.Name, key = name.slice(6);
  for (const locale of ['zh', 'en']) for (const [mode, targets, index] of [['Other', object.act.Target, 0], ['Self', object.act.TargetSelf, 1]]) {
    if (!Array.isArray(targets)) continue;
    for (const group of targets) {
      label(locale, mode, group, name, xiao[locale][key]);
      const text = xiao[locale][`${key}.Desc.${index}`];
      if (typeof text === 'string') add(locale, mode, group, name, text.replace(/\{([012])\}/g, (_, n) => ['SourceCharacter', 'TargetCharacter', xiao[locale][group] || group][n]));
    }
  }
});
scan('../BCJS/LSCG-main/src/Modules/activities.ts', object => {
  // Pinch's added butt/cheek targets have no persistent action; expose them as
  // plugin text options without changing the unmodified game's native activity.
  if (object.ActivityName === 'Pinch' && Array.isArray(object.AddedTargets)) object = { Activity: { Name: 'Pinch' }, Targets: object.AddedTargets };
  if (!object.Activity?.Name || !Array.isArray(object.Targets)) return;
  for (const target of object.Targets) if (target) for (const locale of ['zh', 'en']) {
    label(locale, 'Other', target.Name, `LSCG_${object.Activity.Name}`, target.TargetLabel || object.Activity.Name);
    if (target.SelfAllowed) label(locale, 'Self', target.Name, `LSCG_${object.Activity.Name}`, target.TargetSelfLabel || target.TargetLabel || object.Activity.Name);
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
        for (const group of groups) {
          add(locale, mode, group, object.activity.Name, typeof text === 'string' ? text : text?.[group]);
          const labels = mode === 'Self' ? object.labelSelf || object.label : object.label;
          const translated = typeof labels === 'string' ? labels : labels?.[locale === 'zh' ? 'CN' : 'EN'] || labels?.EN || labels?.CN;
          label(locale, mode, group, object.activity.Name, typeof translated === 'string' ? translated : translated?.[group]);
        }
      }
    });
  }
}
echo('../BCJS/echo-activity-ext-main/src/components');
for (const source of ['xiaosu', 'lscg', 'echo']) {
  const select = catalog => Object.fromEntries(Object.entries(catalog).filter(([key]) => (key.includes('-XSAct_') ? 'xiaosu' : key.includes('-LSCG_') ? 'lscg' : 'echo') === source));
  const base = select(catalogs.en), localized = select(catalogs.zh);
  if (source === 'xiaosu') {
    // Keep explicit identical strings too: they are upstream translations, not missing text.
    for (const [locale, dictionary] of Object.entries(readXiaosuCatalogs(Object.keys(base)))) writeJson(`src/translations/action/xiaosu/${locale}.json`, dictionary);
    continue;
  }
  // LSCG has English source only. Preserve the maintained Chinese translations
  // when refreshing upstream metadata instead of replacing them with English.
  const file = `src/translations/action/${source}/zh.json`;
  if (source === 'lscg' && existsSync(file)) {
    for (const [key, text] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) if (Object.hasOwn(base, key)) localized[key] = text;
  }
  writeCatalog(`src/translations/action/${source}`, base, localized);
  console.log(`${source}: ${Object.keys(select(catalogs.en)).length} literal plugin dialogues`);
}
