// 從 Bondage Club 原始碼擷取 Lite 的判定資料（native-data.json、item-properties-data.json）。
// 產生器（build-native-activities.mjs）與漂移檢查器（check-bc-native.mjs）共用這一份，
// 確保「檢查器認為的正確答案」就是「重新產生後會寫入的內容」。只做靜態解析，不執行任何遊戲或插件程式。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';
import { resolveBcSource } from './bc-source.mjs';

const read = file => readFileSync(file, 'utf8');
const pairs = (node, valueOf) => Object.fromEntries(node.properties.filter(p => p.type === 'ObjectProperty' && !p.computed).map(p => [p.key.name || p.key.value, valueOf(p.value)]));

function poseLists(poseFile) {
  const ast = parse(read(poseFile));
  return Object.fromEntries(ast.program.body.flatMap(n => n.declarations ?? []).filter(n => ['PoseAllStanding', 'PoseAllKneeling'].includes(n.id.name)).map(n => [n.id.name, n.init.arguments[0].elements.map(p => p.value)]));
}

// ───────────────────────── Female3DCG.js：活動、部位、資產規則 ─────────────────────────
function extractFemale(source, poses) {
  const literal = node => {
    if (!node) return undefined;
    if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
    if (node.type === 'MemberExpression' && node.object.name === 'E' && !node.computed) return node.property.name;
    if (node.type === 'Identifier') return poses[node.name];
    if (node.type === 'ArrayExpression') return node.elements.flatMap(e => e?.type === 'SpreadElement' ? (literal(e.argument) ?? [undefined]) : [literal(e)]);
    if (node.type === 'ObjectExpression') return pairs(node, literal);
  };
  const ast = parse(read(source.files.female), { sourceType: 'script' });
  const activities = [], zones = {}, bodies = {}, geometry = {}, mirrors = {}, poseCategories = {}, items = {}, locks = {};
  const assetDefinitions = {}, groupDefinitions = {};
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id.name === 'ActivityFemale3DCG') {
      for (const a of literal(node.init)) activities.push({ name: a.Name, id: a.ActivityID, target: a.Target, self: a.TargetSelf === true ? a.Target : a.TargetSelf || [], prerequisites: a.Prerequisite || [], special: Boolean(a.MakeSound || a.StimulationAction || a.ActivityExpression || a.Reverse) });
    }
    if (node.type === 'VariableDeclarator' && node.id.name === 'PoseFemale3DCG') {
      for (const pose of literal(node.init)) poseCategories[pose.Name] = pose.Category;
    }
    if (node.type === 'ObjectExpression') {
      const props = Object.fromEntries(node.properties.filter(p => p.type === 'ObjectProperty' && !p.computed).map(p => [p.key.name || p.key.value, p.value]));
      const group = literal(props.Group), id = literal(props.ArousalZoneID);
      if (typeof group === 'string' && props.MirrorActivitiesFrom) mirrors[group] = literal(props.MirrorActivitiesFrom);
      if (typeof group === 'string' && Number.isInteger(id)) zones[group] = id;
      if (typeof group === 'string' && Array.isArray(literal(props.Zone))) geometry[group] = literal(props.Zone);
      if (typeof group === 'string' && props.Asset?.type === 'ArrayExpression') {
        bodies[group] = props.Asset.elements.map(n => n?.type === 'StringLiteral' ? n.value : literal(n)?.Name).filter(name => typeof name === 'string');
        groupDefinitions[group] = literal(node);
        for (const n of props.Asset.elements) {
          const asset = n?.type === 'StringLiteral' ? { Name: n.value } : literal(n);
          if (asset?.Name) assetDefinitions[`${group}/${asset.Name}`] = asset;
        }
      }
    }
    for (const [key, value] of Object.entries(node)) if (!['loc', 'comments', 'tokens'].includes(key)) {
      if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  // 資產層級的 CopyConfig 先展開，再擷取遊戲預設值。
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
  return {
    native: { activities, zones, geometry, mirrors, poses: poseCategories, bodies: Object.fromEntries(Object.entries(bodies).filter(([group]) => bodyGroups.includes(group))), items, locks },
    groupDefinitions,
  };
}

// ───────────────────────── Female3DCGExtended.js：擴展道具選項 ─────────────────────────
// R134 起，部分 modular 道具以「識別字」引用定義在 Screens/Inventory/ 的共用 module。
// 這類 module 的 Options 若是 getter（執行期才由其他資產群組算出），這裡以註冊表重建；
// 認不得的引用不猜測，改標為 unknown 並回報警告，讓判定退回保守路徑。
const DYNAMIC_MODULE_OPTIONS = {
  // 選項 0 為「無貼紙」，其後每個貼紙一項，皆沒有 Property。數量取自 Decals 群組（AssetGetDecals 的靜態等價）。
  InventoryItemDevicesBarStoolDecalModule: ({ groupDefinitions }) => {
    const decals = (groupDefinitions.Decals?.Asset ?? []).filter(asset => typeof asset === 'string' || (asset && !asset.Extended
      && (asset.Layer === undefined || (Array.isArray(asset.Layer) && asset.Layer.length === 1 && !asset.Layer[0]?.Name))));
    return [{}, ...decals.map(() => ({}))];
  },
};

function findDeclarations(source, names) {
  const wanted = new Set(names), found = new Map();
  const dir = source.files.inventoryScreens;
  if (!wanted.size || !existsSync(dir)) return found;
  const pattern = new RegExp(`(?:const|let|var)\\s+(${[...wanted].join('|')})\\s*=`);
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith('.js')) {
        const text = read(file), match = pattern.exec(text);
        if (!match || found.has(match[1])) continue;
        const declarator = parse(text, { sourceType: 'script' }).program.body.flatMap(n => n.declarations ?? []).find(n => n.id?.name === match[1]);
        if (declarator?.init?.type === 'ObjectExpression') found.set(match[1], declarator.init);
      }
    }
  };
  visit(dir);
  return found;
}

function extractItemProperties(source, poses, groupDefinitions, warnings) {
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
    if (n.type === 'Identifier') return poses[n.name] ?? { reference: n.name };
    if (n.type === 'ObjectExpression') return Object.fromEntries(n.properties.filter(p => p.type === 'ObjectProperty').map(p => [p.computed ? literal(p.key) : p.key.name ?? p.key.value, literal(p.value)]));
    return undefined;
  }
  const ast = parse(read(source.files.extended));
  const declaration = ast.program.body.flatMap(n => n.declarations ?? []).find(n => n.id.name === 'AssetFemale3DCGExtended');
  if (!declaration) throw new Error('Missing extended item definitions');
  const configs = literal(declaration.init);
  const vibesAst = parse(read(source.files.vibrator));
  const vibes = literal(vibesAst.program.body.flatMap(n => n.declarations ?? []).find(n => n.id.name === 'VibratorModeOptions').init);

  // 先蒐集所有以識別字引用的 module，一次掃描 Screens/Inventory/ 解析。
  const referenced = new Set();
  for (const assets of Object.values(configs)) for (const config of Object.values(assets)) for (const m of config?.Modules ?? []) if (m?.reference) referenced.add(m.reference);
  const declarations = findDeclarations(source, referenced);
  const modules = new Map();
  for (const name of referenced) {
    const node = declarations.get(name);
    if (!node) { warnings.push(`共用 module ${name}：在 Screens/Inventory/ 找不到宣告，相關道具標為 unknown`); continue; }
    const module = literal(node);
    if (!module.Options && node.properties.some(p => p.type === 'ObjectMethod' && p.kind === 'get' && p.key.name === 'Options')) {
      const build = DYNAMIC_MODULE_OPTIONS[name];
      if (!build) { warnings.push(`共用 module ${name}：Options 是執行期 getter 且沒有登記重建方式（請在 native-extract.mjs 的 DYNAMIC_MODULE_OPTIONS 補上），相關道具標為 unknown`); continue; }
      module.Options = build({ groupDefinitions });
    }
    if (typeof module.Key !== 'string' || !Array.isArray(module.Options)) { warnings.push(`共用 module ${name}：缺少 Key 或可解析的 Options，相關道具標為 unknown`); continue; }
    modules.set(name, module);
  }

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
    let unresolvedModule = false;
    const moduleList = c.Modules?.flatMap(m => {
      if (!m?.reference) return [m];
      const module = modules.get(m.reference);
      if (module) return [module];
      unresolvedModule = true;
      return [];
    });
    if (c.Archetype === 'typed') {
      ret.key = c.Name ?? parentName ?? 'typed';
      ret.options = c.Options?.map(o => option(o));
    } else if (c.Archetype === 'modular') {
      ret.modules = moduleList?.map(m => ({ key: m.Key, options: m.Options.map((o, i) => option(o, `${m.Key}${i}`)) }));
    } else if (c.Archetype === 'vibrating') {
      ret.key = c.Name ?? parentName ?? 'vibrating';
      ret.options = (c.Options ?? ['Standard', 'Advanced']).flatMap(k => vibes[k]).map(o => option(o));
    }
    // 自訂初始化與非靜態選項無法忠實模擬。
    ret.unknown = unresolvedModule
      || !['typed', 'modular', 'noarch', 'text', 'variableheight', 'vibrating'].includes(c.Archetype)
      || !!(c.ScriptHooks && Object.hasOwn(c.ScriptHooks, 'Init') && c.ScriptHooks.Init?.reference !== 'PropertyOpacityInit')
      || (c.Archetype === 'typed' && !ret.options)
      || (c.Archetype === 'modular' && !ret.modules)
      || [c.BaselineProperty, ...(c.Options ?? []).map(o => o.Property), ...(moduleList ?? []).flatMap(m => m.Options.map(o => o.Property))]
        .some(p => p && keys.some(k => Object.hasOwn(p, k) && (!Array.isArray(p[k]) || !p[k].every(v => typeof v === 'string'))));
    if (!ret.unknown) delete ret.unknown;
    return ret;
  }
  const result = Object.fromEntries(Object.entries(configs).flatMap(([group, assets]) => Object.keys(assets).map(name => [`${group}/${name}`, pack(resolve(group, name))])));
  const collarAst = parse(read(source.files.slaveCollar));
  const collar = literal(collarAst.program.body.flatMap(n => n.declarations ?? []).find(n => n.id.name === 'InventoryItemNeckSlaveCollarTypes').init);
  result['ItemNeck/SlaveCollar'] = { kind: 'typed', key: 'noarch', baseline: {}, options: collar.map(o => ({ property: props(o.Property) })) };
  return result;
}

/**
 * @param {string} input BC 原始碼目錄（鏡像根目錄或上游倉庫），或舊式 Female3DCG.js 路徑
 * @returns {{ source: ReturnType<typeof resolveBcSource>, native: object, itemProperties: object, warnings: string[] }}
 */
export function extractNativeData(input) {
  const source = resolveBcSource(input);
  const poses = poseLists(source.files.pose);
  const warnings = [];
  const { native, groupDefinitions } = extractFemale(source, poses);
  const itemProperties = extractItemProperties(source, poses, groupDefinitions, warnings);
  return { source, native, itemProperties, warnings };
}
