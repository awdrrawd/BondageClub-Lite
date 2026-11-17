// 測試用的迷你 BC 原始碼：只含抽取器與檢查器需要的結構，不是真實遊戲資料。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const write = (root, file, text) => { const path = join(root, file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
export const TRACKED = { ActivityCheckPrerequisite: 'Scripts/Activity.js', CharacterGetEffects: 'Scripts/Character.js', InventoryGetItemProperty: 'Scripts/Inventory.js', PoseRefresh: 'Scripts/Pose.js', AssetParsePosePrerequisite: 'Scripts/Asset.js', ServerChatRoomGetAllowItem: 'Scripts/Server.js' };

/**
 * @param {string} root
 * @param {{layout?: 'r134'|'legacy', version?: string, extraItem?: boolean, ropeBlock?: string[], hugPrerequisite?: string, functionBody?: Record<string,string>, sharedModule?: 'decal'|'unknown'|'missing', decals?: number}} [options]
 */
export function makeBcSource(root, { layout = 'r134', version = 'R134', extraItem = false, ropeBlock = ['ItemHands'], hugPrerequisite = 'UseHands', functionBody = {}, sharedModule = 'decal', decals = 3 } = {}) {
  const base = layout === 'r134' ? 'Assets' : 'Assets/Female3DCG';
  const decalAssets = Array.from({ length: decals }, (_, i) => `"Decal${i}"`).concat('{ Name: "ExtendedDecal", Extended: true }', '{ Name: "LayeredDecal", Layer: [{ Name: "A" }, { Name: "B" }] }');
  write(root, `${base}/Female3DCG.js`, `
var ActivityFemale3DCG = [
  { Name: "Caress", ActivityID: 1, Target: ["ItemArms"], TargetSelf: ["ItemArms"], Prerequisite: ["UseHands"] },
  { Name: "Hug", ActivityID: 2, Target: ["ItemArms"], Prerequisite: ["${hugPrerequisite}"] },
];
var PoseFemale3DCG = [{ Name: "Kneel", Category: "BodyLower" }];
var AssetFemale3DCG = [
  { Group: "BodyUpper", Asset: ["Normal"] },
  { Group: "ItemArms", ArousalZoneID: 1, Zone: [[0, 0, 10, 10]], Asset: [{ Name: "NylonRope", Effect: [E.Block] }${extraItem ? ', { Name: "NewCuffs", Effect: [E.Block], Block: ["ItemHands"] }' : ''}] },
  { Group: "ItemDevices", Asset: [{ Name: "BarStool" }] },
  { Group: "Decals", Asset: [${decalAssets.join(', ')}] },
];
`);
  const stoolModules = sharedModule === 'missing' ? 'InventoryItemDevicesNoSuchModule' : sharedModule === 'unknown' ? 'InventoryItemDevicesBarStoolMysteryModule' : 'InventoryItemDevicesBarStoolDecalModule';
  write(root, `${base}/Female3DCGExtended.js`, `
var AssetFemale3DCGExtended = {
  ItemArms: { NylonRope: { Archetype: ExtendedArchetype.TYPED, Options: [{ Name: "Loose", Property: {} }, { Name: "Tight", Property: { Block: ${JSON.stringify(ropeBlock)} } }] } },
  ItemDevices: { BarStool: { Archetype: ExtendedArchetype.MODULAR, Modules: [
    { Name: "Seat", Key: "p", Options: [{}, { Property: { Block: ["ItemArms"] } }] },
    ${stoolModules},
  ] } },
};
`);
  write(root, 'Scripts/Pose.js', `const PoseAllStanding = Object.freeze(["BaseLower"]);\nconst PoseAllKneeling = Object.freeze(["Kneel"]);\n${bodyOf('PoseRefresh', functionBody)}\n`);
  write(root, 'Scripts/VibratorMode.js', 'var VibratorModeOptions = { Standard: [], Advanced: [] };\n');
  write(root, 'Scripts/Game.js', `var GameVersion = "${version}";\n`);
  for (const [name, file] of Object.entries(TRACKED)) if (name !== 'PoseRefresh') write(root, file, bodyOf(name, functionBody));
  write(root, 'Screens/Inventory/ItemNeck/SlaveCollar/SlaveCollar.js', 'var InventoryItemNeckSlaveCollarTypes = [{ Name: "Normal", Property: {} }];\n');
  if (sharedModule === 'decal') write(root, 'Screens/Inventory/ItemDevices/BarStool/BarStool.js', `
const InventoryItemDevicesBarStoolDecalModule = {
  Name: "Decal",
  Key: "d",
  get Options() { return [{}, ...InventoryItemDevicesBarStoolDecals().map(() => ({}))]; },
};
`);
  if (sharedModule === 'unknown') write(root, 'Screens/Inventory/ItemDevices/BarStool/BarStool.js', 'const InventoryItemDevicesBarStoolMysteryModule = { Name: "Mystery", Key: "m", get Options() { return computeAtRuntime(); } };\n');
  return root;
}

function bodyOf(name, overrides) {
  return overrides[name] ?? `function ${name}(a, b) {\n\treturn a === b;\n}\n`;
}
