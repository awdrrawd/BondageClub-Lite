import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { parse } from '@babel/parser';

/** Remove module syntax structurally; never rewrite strings containing "export ". */
export function loadTypeScript(path, { inject = [] } = {}) {
  const source = stripTypeScriptTypes(readFileSync(path, 'utf8'));
  const ast = parse(source, { sourceType: 'module' });
  const edits = [];
  for (const node of ast.program.body) {
    if (node.type === 'VariableDeclaration' && node.declarations.every(d => d.id.type === 'Identifier' && inject.includes(d.id.name))) edits.push([node.start, node.end]);
    if (node.type === 'ImportDeclaration') edits.push([node.start, node.end]);
    if (node.type === 'ExportNamedDeclaration') edits.push([node.start, node.declaration?.start ?? node.end]);
    if (['ExportDefaultDeclaration', 'ExportAllDeclaration'].includes(node.type)) throw new Error(`Unsupported test export in ${path}`);
  }
  let code = source;
  for (const [start, end] of edits.sort((a,b)=>b[0]-a[0])) code = code.slice(0,start)+code.slice(end);
  return code;
}
