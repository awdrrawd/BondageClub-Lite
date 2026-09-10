// Extract literal prerequisite metadata only; never execute plugin code.
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {parse} from '@babel/parser';
import {writeJson} from './catalog-utils.mjs';
const rules = {};
const root = process.argv[2] || '../BCJS/echo-activity-ext-main/src/components';
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ObjectExpression') {
    const properties = Object.fromEntries(node.properties.filter(p => p.type === 'ObjectProperty').map(p => [p.key.name || p.key.value,p.value]));
    if (properties.Name?.type === 'StringLiteral' && (properties.Target || properties.TargetSelf) && properties.Prerequisite?.type === 'ArrayExpression') {
      const values = properties.Prerequisite.elements;
      if (values.every(p => p?.type === 'StringLiteral')) rules[`echo:${properties.Name.value}`] = values.map(p => p.value);
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
writeJson('src/action/extension-rules.json',rules);
console.log(`${Object.keys(rules).length} literal ECHO prerequisite definitions`);
