// Preserve declarative plugin predicates as data; never execute plugin callbacks.
export function expandActivityTemplate(node, bindings = {}) {
  if (!node || typeof node !== 'object') return node;
  if (['TSAsExpression', 'TSTypeAssertion'].includes(node.type)) return expandActivityTemplate(node.expression, bindings);
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'map') {
    const array = expandActivityTemplate(node.callee.object, bindings), callback = node.arguments[0];
    if (array?.type === 'ArrayExpression' && callback?.type === 'ArrowFunctionExpression' && callback.params[0]?.type === 'Identifier')
      return { type: 'ArrayExpression', elements: array.elements.map(value => expandActivityTemplate(callback.body, { ...bindings, [callback.params[0].name]: value })) };
  }
  if (node.type === 'Identifier' && bindings[node.name]) return bindings[node.name];
  if (node.type === 'MemberExpression' && !node.computed) {
    const object = expandActivityTemplate(node.object, bindings);
    if (object?.type === 'ObjectExpression') return object.properties.find(p => (p.key?.name ?? p.key?.value) === node.property.name)?.value;
  }
  if (node.type === 'LogicalExpression' && node.operator === '??') return expandActivityTemplate(node.left, bindings) ?? expandActivityTemplate(node.right, bindings);
  if (node.type === 'ArrayExpression') return { ...node, elements: node.elements.flatMap(n => n?.type === 'SpreadElement' ? (expandActivityTemplate(n.argument, bindings)?.elements ?? [n]) : [expandActivityTemplate(n, bindings)]) };
  if (node.type === 'ObjectExpression') {
    const properties = new Map();
    for (const p of node.properties) {
      const members = p.type === 'SpreadElement' ? expandActivityTemplate(p.argument, bindings)?.properties ?? [] : [{ ...p, value: expandActivityTemplate(p.value, bindings) }];
      for (const member of members) properties.set(member.key?.name ?? member.key?.value, member);
    }
    return { ...node, properties: [...properties.values()] };
  }
  return node;
}

export function readPrerequisite(node, constants = {}) {
  const literal = n => n?.type === 'StringLiteral' ? n.value
    : n?.type === 'ArrayExpression' ? n.elements.map(literal)
    : n?.type === 'Identifier' ? constants[n.name] : undefined;
  const path = n => n?.type === 'Identifier' ? n.name
    : n?.type === 'MemberExpression' && !n.computed ? `${path(n.object)}.${n.property.name}` : '';
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type !== 'CallExpression') return 'UnsupportedPluginPrerequisite';
  const name = path(node.callee);
  const relation = name.match(/^Prereqs\.Relation\.(Lover|ActingOwnActed|ActedOwnActing)$/);
  if (relation && !node.arguments.length) return { subject: 'Relation', check: relation[1] };
  const op = name.replace(/^Prereqs\./, '');
  if (['all', 'and', 'any', 'or', 'not', 'nand', 'nor'].includes(op)) {
    const args = node.arguments.map(n => readPrerequisite(n, constants));
    if (op === 'not') return { not: args[0] };
    const rule = ['all', 'and', 'nand'].includes(op) ? { all: args } : { any: args };
    return ['nand', 'nor'].includes(op) ? { not: rule } : rule;
  }
  const match = name.match(/^Prereqs\.(Acting|Acted)\.(GroupIs|GroupEmpty|TargetGroupEmpty|TargetGroupIs|GroupAccessible|PoseIs|PoseIsStanding|PoseIsKneeling|PoseIsAllFours|PoseIsHogtied)$/);
  const args = node.arguments.map(literal);
  if (!match || args.some(a => a === undefined || (Array.isArray(a) && a.includes(undefined)))) return 'UnsupportedPluginPrerequisite';
  return { subject: match[1], check: match[2], args };
}
