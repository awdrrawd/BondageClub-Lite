// Read literal asset definitions only. Never import or execute the plugin or its callbacks.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { writeCatalog } from './catalog-utils.mjs';

export function extractItems(source) {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
  const bindings = new Map();
  let blocked = new Set();
  for (const statement of ast.program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'VariableDeclaration' && declaration.kind === 'const') for (const variable of declaration.declarations) if (variable.id.type === 'Identifier') bindings.set(variable.id.name, variable.init);
  }
  function literal(node, seen = new Set()) {
    if (!node) return undefined;
    if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
    if (node.type === 'Identifier' && !blocked.has(node.name) && bindings.has(node.name) && !seen.has(node.name)) return literal(bindings.get(node.name), new Set([...seen, node.name]));
    if (node.type === 'TSAsExpression') return literal(node.expression, seen);
    if (node.type === 'MemberExpression') {
      const object = literal(node.object, seen), key = node.computed ? literal(node.property, seen) : node.property.name;
      return object && Object.hasOwn(object, key) ? object[key] : undefined;
    }
    if (node.type === 'ArrayExpression') return node.elements.map(element => literal(element, seen));
    if (node.type === 'ObjectExpression') {
      const result = {};
      for (const property of node.properties) {
        if (property.type === 'SpreadElement') { const spread = literal(property.argument, seen); if (!spread || typeof spread !== 'object') return undefined; Object.assign(result, spread); }
        else if (property.type === 'ObjectProperty') {
          const key = property.computed ? literal(property.key, seen) : property.key.name ?? property.key.value;
          if (typeof key === 'string') Object.defineProperty(result, key, { value: literal(property.value, seen), enumerable: true, configurable: true, writable: true });
        }
      }
      return result;
    }
    return undefined;
  }
  const items = { en: {}, zh: {} }, groups = { en: {}, zh: {} }, aliases = [];
  let skipped = 0;
  const names = value => typeof value === 'string' ? [value] : Array.isArray(value) && value.every(name => typeof name === 'string') ? value : [];
  function add(destination, key, translation, fallback) {
    const en = translation?.EN || translation?.CN || fallback;
    const zh = translation?.TW || translation?.CN || en;
    if (typeof en !== 'string' || typeof zh !== 'string' || !en.trim() || !zh.trim()) return;
    for (const [locale, text] of [['en', en], ['zh', zh]]) {
      if (Object.hasOwn(destination[locale], key) && destination[locale][key] !== text) throw new Error(`Conflicting item translation: ${key}`);
      destination[locale][key] = text;
    }
  }
  function register(group, asset, config) {
    if (!names(group).length || typeof asset?.Name !== 'string' || !config?.translation) return false;
    for (const name of names(group)) add(items, `Asset.${name}.${asset.Name}`, config.translation, asset.Name);
    return true;
  }
  function assetCall(args) {
    if (register(...args)) return true;
    if (args.length === 2 && names(args[0]).length && Array.isArray(args[1])) return args[1].map(entry => Array.isArray(entry) && register(args[0], ...entry)).some(Boolean);
    if (args.length === 1 && Array.isArray(args[0])) {
      if (register(...args[0])) return true;
      if (names(args[0][0]).length) return assetCall(args[0]);
      return args[0].map(entry => Array.isArray(entry) && assetCall(entry)).some(Boolean);
    }
    return false;
  }
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    const previous = blocked;
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
      blocked = new Set(blocked);
      const bind = pattern => {
        if (!pattern || typeof pattern !== 'object') return;
        if (pattern.type === 'Identifier') blocked.add(pattern.name);
        else for (const value of Object.values(pattern)) if (Array.isArray(value)) value.forEach(bind); else if (value && typeof value === 'object') bind(value);
      };
      node.params.forEach(bind);
      const locals = value => {
        if (!value || typeof value !== 'object' || ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(value.type)) return;
        if (value.type === 'VariableDeclarator') bind(value.id);
        for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(locals); else if (child && typeof child === 'object') locals(child);
      };
      locals(node.body);
    }
    if (node.type === 'ObjectExpression') {
      const value = literal(node);
      if (typeof value?.groupDef?.Group === 'string' && value.description) add(groups, `Group.${value.groupDef.Group}`, value.description, value.groupDef.Group);
    }
    if (node.type === 'CallExpression') {
      const call = node.callee;
      if (call.type === 'MemberExpression' && call.object?.name === 'AssetManager' && call.property?.name === 'addAssetWithConfig') {
        if (!assetCall(node.arguments.map(arg => literal(arg)))) skipped++;
      }
      if (call.type === 'Identifier' && ['luziSuffixFixups', 'luziPrefixFixups', 'groupFixup'].includes(call.name)) {
        const [group, name, other] = node.arguments.map(arg => literal(arg));
        if (typeof name === 'string') for (const g of names(group)) aliases.push([g, call.name === 'groupFixup' ? name : call.name === 'luziSuffixFixups' ? `${name}_Luzi` : other || `Luzi_${name}`, call.name === 'groupFixup' ? other : name]);
      }
    }
    for (const [key, value] of Object.entries(node)) if (!['loc', 'comments', 'tokens'].includes(key)) {
      if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    }
    blocked = previous;
  }
  walk(ast.program);
  for (const [group, oldName, newName] of aliases) for (const locale of ['en', 'zh']) {
    const value = items[locale][`Asset.${group}.${newName}`];
    if (value) items[locale][`Asset.${group}.${oldName}`] = value;
  }
  return { items, groups, skipped };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] || '../BCJS/echo-clothing-ext-main/src/components');
  const merged = { items: { en: {}, zh: {} }, groups: { en: {}, zh: {} } };
  let skipped = 0, files = 0;
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.name === '0模板') continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (entry.name.endsWith('.js')) {
        const extracted = extractItems(readFileSync(file, 'utf8')); files++; skipped += extracted.skipped;
        for (const type of ['items', 'groups']) for (const locale of ['en', 'zh']) for (const [key, value] of Object.entries(extracted[type][locale])) {
          if (Object.hasOwn(merged[type][locale], key) && merged[type][locale][key] !== value) throw new Error(`Conflicting translation in ${file}: ${key}`);
          merged[type][locale][key] = value;
        }
      }
    }
  }
  scan(root);
  for (const type of ['items', 'groups']) writeCatalog(`src/translations/${type}/echo`, merged[type].en, merged[type].zh);
  console.log(`ECHO literal names: ${Object.keys(merged.items.en).length} item keys, ${Object.keys(merged.groups.en).length} groups; ${files} files, ${skipped} unresolved registration calls (not executed).`);
}
