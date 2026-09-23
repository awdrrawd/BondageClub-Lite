import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { dirname, resolve as resolvePath } from 'node:path';

// Extract data only. Never execute upstream item hooks in Lite or during builds.
export function itemPropertiesCatalog(path) {
  const ast = parse(readFileSync(path, 'utf8'));
  const poseAst = parse(readFileSync(resolvePath(dirname(path), '../../Scripts/Pose.js'), 'utf8'));
  const poseLists = Object.fromEntries(poseAst.program.body.flatMap(n => n.declarations ?? []).filter(n => ['PoseAllStanding', 'PoseAllKneeling'].includes(n.id.name)).map(n => [n.id.name, n.init.arguments[0].elements.map(p => p.value)]));
  const keys = ['Effect', 'Block', 'AllowActivity', 'AllowActivityOn', 'Expose', 'SetPose', 'AllowActivePose'];
  function literal(n) {
    if (!n) return undefined;
    if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(n.type)) return n.value;
    if (n.type === 'NullLiteral') return null;
    if (n.type === 'MemberExpression' && !n.computed) {
      if (n.object.name === 'E') return n.property.name;
      if (n.object.name === 'ExtendedArchetype') return n.property.name.toLowerCase();
      if (n.object.name === 'VibratorModeSet') return n.property.name === 'STANDARD' ? 'Standard' : 'Advanced';
    }
    if (n.type === 'ArrayExpression') return n.elements.flatMap(e => e?.type === 'SpreadElement' ? (literal(e.argument) ?? [undefined]) : [literal(e)]);
    if (n.type === 'Identifier') return poseLists[n.name] ?? { reference: n.name };
    if (n.type === 'ObjectExpression') return Object.fromEntries(n.properties.filter(p => p.type === 'ObjectProperty').map(p => [p.computed ? literal(p.key) : p.key.name ?? p.key.value, literal(p.value)]));
    return undefined;
  }
  const declaration = ast.program.body.flatMap(n => n.declarations ?? []).find(n => n.id.name === 'AssetFemale3DCGExtended');
  if (!declaration) throw new Error('Missing extended item definitions');
  const configs = literal(declaration.init);
  const vibesAst = parse(readFileSync(resolvePath(dirname(path), '../../Scripts/VibratorMode.js'), 'utf8'));
  const vibes = literal(vibesAst.program.body.flatMap(n => n.declarations ?? []).find(n => n.id.name === 'VibratorModeOptions').init);
  function resolve(group, name, visited = new Set()) {
    const id = `${group}/${name}`;
    if (visited.has(id)) throw new Error(`Cyclic extended config: ${id}`);
    visited.add(id);
    const config = configs[group]?.[name];
    if (!config) throw new Error(`Missing extended config: ${id}`);
    const copy = config.CopyConfig;
    return copy ? { ...resolve(copy.GroupName ?? group, copy.AssetName, visited), ...config } : config;
  }
  const props = p => Object.fromEntries(keys.filter(k => Array.isArray(p?.[k]) && p[k].every(v => typeof v === 'string')).map(k => [k, p[k]]));
  function pack(c, parentName) {
    const option = (o, name = o.Name) => ({ property: props(o.Property), ...(o.ArchetypeConfig ? { child: pack(o.ArchetypeConfig, name) } : {}) });
    const ret = { kind: c.Archetype, baseline: props(c.BaselineProperty) };
    if (c.Archetype === 'typed') {
      ret.key = c.Name ?? parentName ?? 'typed';
      ret.options = c.Options?.map(o => option(o));
    } else if (c.Archetype === 'modular') {
      ret.modules = c.Modules?.map(m => ({ key: m.Key, options: m.Options.map((o, i) => option(o, `${m.Key}${i}`)) }));
    } else if (c.Archetype === 'vibrating') {
      ret.key = c.Name ?? parentName ?? 'vibrating';
      ret.options = (c.Options ?? ['Standard', 'Advanced']).flatMap(k => vibes[k]).map(o => option(o));
    }
    // Custom initialization and non-static options cannot be faithfully emulated.
    ret.unknown = !['typed', 'modular', 'noarch', 'text', 'variableheight', 'vibrating'].includes(c.Archetype)
      || !!(c.ScriptHooks && Object.hasOwn(c.ScriptHooks, 'Init') && c.ScriptHooks.Init?.reference !== 'PropertyOpacityInit')
      || (c.Archetype === 'typed' && !ret.options)
      || (c.Archetype === 'modular' && !ret.modules)
      || [c.BaselineProperty, ...(c.Options ?? []).map(o => o.Property), ...(c.Modules ?? []).flatMap(m => m.Options.map(o => o.Property))]
        .some(p => p && keys.some(k => Object.hasOwn(p, k) && (!Array.isArray(p[k]) || !p[k].every(v => typeof v === 'string'))));
    if (!ret.unknown) delete ret.unknown;
    return ret;
  }
  const result = Object.fromEntries(Object.entries(configs).flatMap(([group, assets]) => Object.keys(assets).map(name => [`${group}/${name}`, pack(resolve(group, name))])));
  const collarAst = parse(readFileSync(resolvePath(dirname(path), '../../Screens/Inventory/ItemNeck/SlaveCollar/SlaveCollar.js'), 'utf8'));
  const collar = literal(collarAst.program.body.flatMap(n => n.declarations ?? []).find(n => n.id.name === 'InventoryItemNeckSlaveCollarTypes').init);
  result['ItemNeck/SlaveCollar'] = { kind: 'typed', key: 'noarch', baseline: {}, options: collar.map(o => ({ property: props(o.Property) })) };
  return result;
}
