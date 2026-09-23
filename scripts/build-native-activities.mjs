import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { writeJson } from './catalog-utils.mjs';
import { dirname, join } from 'node:path';
import { itemPropertiesCatalog } from './build-item-properties.mjs';
const sourcePath = process.argv[2] || '../Bondage-College-Mirror-bondageclub/Assets/Female3DCG/Female3DCG.js';
const source = readFileSync(sourcePath, 'utf8');
const poseAst = parse(readFileSync(join(dirname(sourcePath), '../../Scripts/Pose.js'), 'utf8'));
const poseLists = Object.fromEntries(poseAst.program.body.flatMap(n => n.declarations ?? []).filter(n => ['PoseAllStanding', 'PoseAllKneeling'].includes(n.id.name)).map(n => [n.id.name, n.init.arguments[0].elements.map(p => p.value)]));
function literal(node) {
  if (!node) return undefined;
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
  if (node.type === 'MemberExpression' && node.object.name === 'E' && !node.computed) return node.property.name;
  if (node.type === 'Identifier') return poseLists[node.name];
  if (node.type === 'ArrayExpression') return node.elements.flatMap(e => e?.type === 'SpreadElement' ? (literal(e.argument) ?? [undefined]) : [literal(e)]);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.filter(p => p.type === 'ObjectProperty' && !p.computed).map(p => [p.key.name || p.key.value, literal(p.value)]));
}
const ast = parse(source, { sourceType: 'script' });
const activities = [], zones = {}, bodies = {}, geometry = {}, items = {}, locks = {}, mirrors = {}, poses = {};
const assetDefinitions = {}, groupDefinitions = {};
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id.name === 'ActivityFemale3DCG') {
    for (const a of literal(node.init)) activities.push({ name: a.Name, id: a.ActivityID, target: a.Target, self: a.TargetSelf === true ? a.Target : a.TargetSelf || [], prerequisites: a.Prerequisite || [], special: Boolean(a.MakeSound || a.StimulationAction || a.ActivityExpression || a.Reverse) });
  }
  if (node.type === 'VariableDeclarator' && node.id.name === 'PoseFemale3DCG') {
    for (const pose of literal(node.init)) poses[pose.Name] = pose.Category;
  }
  if (node.type === 'ObjectExpression') {
    const props = Object.fromEntries(node.properties.filter(p => p.type === 'ObjectProperty' && !p.computed).map(p => [p.key.name || p.key.value, p.value]));
    const group = literal(props.Group), id = literal(props.ArousalZoneID);
    if (typeof group === 'string' && props.MirrorActivitiesFrom) mirrors[group] = literal(props.MirrorActivitiesFrom);
    if (typeof group === 'string' && Number.isInteger(id)) zones[group] = id;
    if (typeof group === 'string' && Array.isArray(literal(props.Zone))) geometry[group] = literal(props.Zone);
    if (typeof group === 'string' && props.Asset?.type === 'ArrayExpression') bodies[group] = props.Asset.elements.map(node => node?.type === 'StringLiteral' ? node.value : literal(node)?.Name).filter(name => typeof name === 'string');
    if (typeof group === 'string' && props.Asset?.type === 'ArrayExpression') {
      groupDefinitions[group] = literal(node);
      for (const node of props.Asset.elements) {
        const asset = node?.type === 'StringLiteral' ? { Name: node.value } : literal(node);
        if (!asset?.Name) continue;
        assetDefinitions[`${group}/${asset.Name}`] = asset;
      }
    }
  }
  for (const [key, value] of Object.entries(node)) if (!['loc', 'comments', 'tokens'].includes(key)) {
    if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
  }
}
walk(ast);
// R132 also uses asset-level CopyConfig; resolve it before extracting gameplay defaults.
function resolveAsset(key, visited = new Set()) {
  if (visited.has(key)) throw new Error(`Cyclic asset config: ${key}`);
  visited.add(key);
  const asset = assetDefinitions[key];
  if (!asset) throw new Error(`Missing asset config: ${key}`);
  const copy = asset.CopyConfig;
  return copy ? { ...resolveAsset(`${copy.GroupName ?? key.split('/')[0]}/${copy.AssetName}`, visited), ...asset } : asset;
}
for (const key of Object.keys(assetDefinitions)) {
  const asset = resolveAsset(key), group = groupDefinitions[key.split('/')[0]], rule = {};
  for (const field of ['Effect', 'Block', 'AllowActivityOn', 'AllowActivity', 'Expose', 'SetPose', 'AllowActivePose']) {
    const value = Object.hasOwn(asset, field) ? asset[field] : field === 'AllowActivityOn' ? [] : group[field] ?? [];
    if (Array.isArray(value) && value.every(v => typeof v === 'string')) { if (value.length) rule[field] = value; }
    else rule.unknown = true;
  }
  items[key] = rule;
  if (asset.IsLock) locks[asset.Name] = { owner: asset.OwnerOnly === true, lover: asset.LoverOnly === true, family: asset.FamilyOnly === true };
}
const bodyGroups = ['BodyUpper', 'BodyLower', 'Height', 'Eyes', 'Eyes2', 'Eyebrows', 'Mouth', 'Blush', 'Fluids', 'Emoticon', 'HairFront', 'HairBack'];
writeJson('src/action/native-data.json', { activities, zones, geometry, mirrors, poses, bodies: Object.fromEntries(Object.entries(bodies).filter(([group]) => bodyGroups.includes(group))), items, locks });
console.log(`${activities.length} native activities, ${Object.keys(zones).length} zones`);
writeJson('src/action/item-properties-data.json', itemPropertiesCatalog(join(dirname(sourcePath), 'Female3DCGExtended.js')));
