import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse } from '@babel/parser';

function runtimeGraph() {
  const graph = new Map();
  for (const name of readdirSync('src', { recursive: true }).filter(p => p.endsWith('.ts') && !p.endsWith('.d.ts'))) {
    const file = resolve('src', name);
    const ast = parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['typescript'] });
    const edges = [];
    for (const node of ast.program.body) {
      if (node.type !== 'ImportDeclaration' || node.importKind === 'type' || !node.source.value.startsWith('.')) continue;
      if (node.specifiers.length && node.specifiers.every(s => s.importKind === 'type')) continue;
      const base = resolve(dirname(file), node.source.value);
      const target = [base + '.ts', resolve(base, 'index.ts')].find(existsSync);
      if (target) edges.push(target);
    }
    graph.set(file, edges);
  }
  return graph;
}

test('runtime module imports have no cycles and UI preview cannot load the network client', () => {
  const graph = runtimeGraph(), visited = new Set();
  function check(file, stack = []) {
    assert.ok(!stack.includes(file), `Import cycle: ${[...stack, file].join(' -> ')}`);
    if (visited.has(file)) return;
    for (const dependency of graph.get(file) ?? []) check(dependency, [...stack, file]);
    visited.add(file);
  }
  for (const file of graph.keys()) check(file);
  const preview = new Set();
  function collect(file) {
    if (preview.has(file)) return;
    preview.add(file);
    for (const dependency of graph.get(file) ?? []) collect(dependency);
  }
  collect(resolve('src/preview/main.ts'));
  assert.ok(!preview.has(resolve('src/network/client.ts')));
  assert.ok(preview.has(resolve('src/ui/app.ts')));
});
