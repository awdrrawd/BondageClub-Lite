import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { writeJson } from './catalog-utils.mjs';
const source = readFileSync(process.argv[2] || '../BCJS/Bondage-College-master/BondageClub/Assets/Female3DCG/Female3DCG.js', 'utf8');
function literal(node) {
  if (!node) return undefined;
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
  if (node.type === 'MemberExpression' && node.object.name === 'E' && !node.computed) return node.property.name;
  if (node.type === 'ArrayExpression') return node.elements.map(literal);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.filter(p => p.type === 'ObjectProperty' && !p.computed).map(p => [p.key.name || p.key.value, literal(p.value)]));
}
const ast = parse(source, { sourceType: 'script' });
const activities = [], zones = {}, bodies = {}, geometry = {}, items = {}, locks = {};
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id.name === 'ActivityFemale3DCG') {
    for (const a of literal(node.init)) activities.push({ name: a.Name, id: a.ActivityID, target: a.Target, self: a.TargetSelf === true ? a.Target : a.TargetSelf || [], prerequisites: a.Prerequisite || [], special: Boolean(a.MakeSound || a.StimulationAction || a.ActivityExpression || a.Reverse) });
  }
  if (node.type === 'ObjectExpression') {
    const props = Object.fromEntries(node.properties.filter(p => p.type === 'ObjectProperty' && !p.computed).map(p => [p.key.name || p.key.value, p.value]));
    const group = literal(props.Group), id = literal(props.ArousalZoneID);
    if (typeof group === 'string' && Number.isInteger(id)) zones[group] = id;
    if (typeof group === 'string' && Array.isArray(literal(props.Zone))) geometry[group] = literal(props.Zone);
    if (typeof group === 'string' && props.Asset?.type === 'ArrayExpression') bodies[group] = props.Asset.elements.map(node => node?.type === 'StringLiteral' ? node.value : literal(node)?.Name).filter(name => typeof name === 'string');
    if (typeof group === 'string' && props.Asset?.type === 'ArrayExpression') {
      for (const node of props.Asset.elements) {
        const asset = node?.type === 'StringLiteral' ? { Name: node.value } : literal(node);
        if (!asset?.Name) continue;
        if (asset.IsLock === true) locks[asset.Name] = { owner: asset.OwnerOnly === true, lover: asset.LoverOnly === true, family: asset.FamilyOnly === true };
        const rule = {};
        for (const key of ['Effect', 'Block', 'AllowActivityOn', 'AllowActivity', 'Expose']) {
          const ownNode = node?.properties?.find(property => property.type === 'ObjectProperty' && (property.key.name || property.key.value) === key)?.value;
          const inheritedNode = key === 'AllowActivityOn' ? undefined : props[key];
          if ((ownNode && literal(ownNode) === undefined) || (!ownNode && inheritedNode && literal(inheritedNode) === undefined)) rule.unknown = true;
          const values = asset[key] ?? literal(inheritedNode) ?? [];
          if (Array.isArray(values) && values.every(value => typeof value === 'string')) { if (values.length) rule[key] = values; }
          else rule.unknown = true;
        }
        items[`${group}/${asset.Name}`] = rule;
      }
    }
  }
  for (const [key, value] of Object.entries(node)) if (!['loc', 'comments', 'tokens'].includes(key)) {
    if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
  }
}
walk(ast);
const bodyGroups = ['BodyUpper', 'BodyLower', 'Height', 'Eyes', 'Eyes2', 'Eyebrows', 'Mouth', 'Blush', 'Fluids', 'Emoticon', 'HairFront', 'HairBack'];
writeJson('src/action/native-data.json', { activities, zones, geometry, bodies: Object.fromEntries(Object.entries(bodies).filter(([group]) => bodyGroups.includes(group))), items, locks });
console.log(`${activities.length} native activities, ${Object.keys(zones).length} zones`);
