// Archived one-time migration. Current translations must never be overwritten.
if (process.argv.includes('--write')) throw new Error('Legacy migration is read-only; edit src/translations instead.');
import { parse } from '@babel/parser';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const catalog = {};
const keys = new Map();
const extras = new Set(['CONTACTS & BEEP', 'MAKE IT YOURS']);
function key(text) {
  if (!keys.has(text)) { const id = `m${String(keys.size + 1).padStart(3, '0')}`; keys.set(text, id); catalog[id] = text; }
  return keys.get(text);
}
for (const file of ['src/ui/app.ts', 'src/network/client.ts', 'src/profile/biography.ts']) {
  const source = readFileSync(file, 'utf8');
  if (process.argv.includes('--write') && source.includes('from "../i18n"')) throw new Error('Sources are already migrated; edit src/translations/ui directly.');
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
  function render(node) {
    if (node.type === 'StringLiteral' && (/\p{Script=Han}/u.test(node.value) || extras.has(node.value))) return `t(${JSON.stringify(key(node.value))})`;
    if (node.type === 'TemplateLiteral' && node.quasis.some(part => /\p{Script=Han}/u.test(part.value.cooked || ''))) {
      const text = node.quasis.map((part, i) => (part.value.cooked || '') + (i < node.expressions.length ? `{${i}}` : '')).join('');
      return `t(${JSON.stringify(key(text))}, [${node.expressions.map(render).join(', ')}])`;
    }
    const children = Object.entries(node).filter(([name]) => !['loc', 'tokens', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(name)).flatMap(([, value]) => Array.isArray(value) ? value : [value]).filter(value => value && typeof value.type === 'string' && typeof value.start === 'number');
    children.sort((a, b) => a.start - b.start);
    let result = '', position = node.start;
    for (const child of children) { if (child.start < position) continue; result += source.slice(position, child.start) + render(child); position = child.end; }
    return result + source.slice(position, node.end);
  }
  const output = `import { t } from "../i18n";\n` + render(ast.program);
  if (process.argv.includes('--write')) writeFileSync(file, output);
}
if (process.argv.includes('--write')) { mkdirSync('src/translations/ui', { recursive: true }); writeFileSync('src/translations/ui/zh.json', JSON.stringify(catalog, null, 2) + '\n'); }
console.log(JSON.stringify(catalog, null, 2));
