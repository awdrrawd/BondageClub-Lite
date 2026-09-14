// Extract literal prerequisite metadata only; never execute plugin code.
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {parse} from '@babel/parser';
import {writeJson} from './catalog-utils.mjs';
const rules = {};
const root = process.argv[2] || '../BCJS/echo-activity-ext-main/src/components';
const unwrap = node => ['TSAsExpression', 'TSTypeAssertion'].includes(node?.type) ? unwrap(node.expression) : node;
const props = node => Object.fromEntries((unwrap(node)?.properties || []).filter(p => p.type === 'ObjectProperty').map(p => [p.key.name || p.key.value, unwrap(p.value)]));
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ObjectExpression') {
    const properties = props(node);
    const activity = props(properties.Activity || properties.act);
    if (activity.Name?.type === 'StringLiteral') {
      const source = properties.Activity ? 'lscg' : 'xiaosu';
      const name = (source === 'lscg' ? 'LSCG_' : '') + activity.Name.value;
      const prerequisites = activity.Prerequisite?.elements || [];
      const custom = (properties.CustomPrereqs?.elements || []).map(entry => props(entry).Name);
      rules[`${source}:${name}`] = [...new Set([...prerequisites, ...custom].map(entry => entry?.type === 'StringLiteral' ? entry.value : 'UnsupportedPluginPrerequisite'))];
    }
    if (properties.Name?.type === 'StringLiteral' && (properties.Target || properties.TargetSelf) && properties.Prerequisite?.type === 'ArrayExpression') {
      const values = properties.Prerequisite.elements;
      rules[`echo:${properties.Name.value}`] = values.map(p => p?.type === 'StringLiteral' ? p.value : 'UnsupportedPluginPrerequisite');
    }
  }
  for (const [key,value] of Object.entries(node)) if (!['loc','comments','tokens'].includes(key)) {
    if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
  }
}
function scan(dir) {
  for (const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path=join(dir,entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.name.endsWith('.js')) walk(parse(readFileSync(path,'utf8'),{sourceType:'module'}));
  }
}
scan(root);
for (const file of ['../BCJS/LSCG-main/src/Modules/activities.ts', '../XiaoSuActivity/src/Modules/MActivity.ts']) walk(parse(readFileSync(file, 'utf8'), {sourceType:'module', plugins:['typescript']}));
writeJson('src/action/extension-rules.json',rules);
console.log(`${Object.keys(rules).length} plugin prerequisite definitions`);
