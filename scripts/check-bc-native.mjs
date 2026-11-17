// 對照 Bondage Club 原始碼，檢查 Lite 提交的 BC 判定資料是否落後，以及 Lite 模仿的 BC 判定函式是否改動。
//   用法：
//     BC_SOURCE_DIR=<BC 原始碼> node scripts/check-bc-native.mjs [--json 報告檔] [--report 純文字報告檔]
//     node scripts/check-bc-native.mjs --bc-dir <BC 原始碼> --update-baseline     以該原始碼重寫「判定函式」基準
//   其他參數：--data-dir <目錄>（預設 src/action）、--baseline <檔>、--native-ts <檔>。
//   BC 原始碼可為程式碼鏡像（根目錄有 Assets/、Scripts/），或上游倉庫（內含 BondageClub/）。
//
// 檢查兩層：
// 1. 資料層：用與 build-native-activities.mjs 相同的抽取器（native-extract.mjs）從 BC 重新抽取，
//    與已提交的 native-data.json、item-properties-data.json 逐項比對。
//    查不到的道具在 Lite 中不會貢獻任何 Effect/Block，所以缺漏的道具不是「保守」而是「放行」，必須追蹤。
//    另外檢查 BC 活動的前置條件是否都被 native.ts 認得（不認得的條件會停用該活動，方向安全，但活動無法使用）。
// 2. 邏輯層：native.ts／appearance-state.ts 手工模仿的 BC 函式（ActivityCheckPrerequisite 等），
//    其內容雜湊與基準（scripts/bc-native-baseline.json）不同時提醒重新檢視。雜湊算法與 HSC 的 check-bc-compat 相同。
//    基準記錄的是「建立基準當下」的函式內容，並不代表當時已逐行核對過模仿邏輯。
//
// 結束碼：0 = 一致、1 = 有差異（交給 issue 通知）、2 = 用法或解析錯誤（檢查本身壞了）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';
import { extractNativeData } from './native-extract.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_DATA_DIR = path.join(ROOT, 'src', 'action');
export const DEFAULT_BASELINE = path.join(ROOT, 'scripts', 'bc-native-baseline.json');
export const DEFAULT_NATIVE_TS = path.join(ROOT, 'src', 'action', 'native.ts');
// native.ts／appearance-state.ts 註解中明確引用、手工模仿的 BC 函式。
export const TRACKED_FUNCTIONS = ['ActivityCheckPrerequisite', 'CharacterGetEffects', 'InventoryGetItemProperty', 'PoseRefresh', 'AssetParsePosePrerequisite', 'ServerChatRoomGetAllowItem'];
const RULE_FIELDS = ['Effect', 'Block', 'AllowActivityOn', 'AllowActivity', 'Expose', 'SetPose', 'AllowActivePose', 'unknown'];

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** ModSDK 計算 originalHash 的 CRC32（大寫 8 位十六進位）。與 HSC 的 check-bc-compat.mjs 相同。 */
export function crc32(text) {
  let crc = -1;
  for (const byte of new TextEncoder().encode(text)) {
    let value = 255 & (crc ^ byte);
    for (let bit = 0; bit < 8; bit++) value = 1 & value ? -306674912 ^ value >>> 1 : value >>> 1;
    crc = crc >>> 8 ^ value;
  }
  return ((-1 ^ crc) >>> 0).toString(16).padStart(8, '0').toUpperCase();
}
export const hashSource = source => crc32(source.replaceAll('\r\n', '\n'));

/** native.ts 認得的字串前置條件（switch 的 case 標籤），加上 Needs-／TargetNeeds- 前綴規則。 */
export function supportedPrerequisites(nativeTs) {
  return new Set([...nativeTs.matchAll(/\bcase\s+"([^"]+)"/g)].map(match => match[1]));
}
const isSupported = (name, supported) => supported.has(name) || /^(?:Target)?Needs-/.test(name);
function prerequisiteNames(prerequisite) {
  if (typeof prerequisite === 'string') return [prerequisite];
  if (!prerequisite || typeof prerequisite !== 'object') return [];
  return [...(prerequisite.all ?? []), ...(prerequisite.any ?? []), ...(prerequisite.not ? [prerequisite.not] : [])].flatMap(prerequisiteNames);
}

/** 在 BC 的 Scripts/ 找出頂層函式宣告並計算雜湊。找不到的函式列在 missing。 */
export function collectFunctionHashes(root, names = TRACKED_FUNCTIONS) {
  const scripts = path.join(root, 'Scripts');
  const files = fs.readdirSync(scripts).filter(name => name.endsWith('.js')).map(name => path.join(scripts, name));
  const texts = new Map(files.map(file => [file, fs.readFileSync(file, 'utf8')]));
  const functions = {}, missing = [];
  for (const name of names) {
    const pattern = new RegExp(`^function\\s+${name}\\s*\\(`, 'm');
    const file = files.find(candidate => pattern.test(texts.get(candidate)));
    let node;
    if (file) {
      const ast = parse(texts.get(file), { sourceType: 'script' });
      node = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id?.name === name);
    }
    if (!file || !node) { missing.push(name); continue; }
    functions[name] = { hash: hashSource(texts.get(file).slice(node.start, node.end)), file: path.relative(root, file).split(path.sep).join('/') };
  }
  return { functions, missing };
}

function ruleDiff(was, now) {
  return RULE_FIELDS.filter(field => !same(was?.[field], now?.[field]));
}

/** 純函式：比對 BC 抽取結果與已提交資料，回傳各類差異。 */
export function compareNative(bc, committed, supported) {
  const wasItems = committed.native.items ?? {}, nowItems = bc.native.items;
  const missing = Object.keys(nowItems).filter(key => !(key in wasItems)).sort();
  const items = {
    missing: missing.map(key => ({ key, restrictive: Object.keys(nowItems[key]).length > 0 })),
    changed: Object.keys(nowItems).filter(key => key in wasItems && !same(wasItems[key], nowItems[key])).sort().map(key => ({ key, fields: ruleDiff(wasItems[key], nowItems[key]) })),
    removed: Object.keys(wasItems).filter(key => !(key in nowItems)).sort(),
  };
  const wasExt = committed.itemProperties ?? {}, nowExt = bc.itemProperties;
  const extended = {
    missing: Object.keys(nowExt).filter(key => !(key in wasExt)).sort(),
    changed: Object.keys(nowExt).filter(key => key in wasExt && !same(wasExt[key], nowExt[key])).sort(),
    removed: Object.keys(wasExt).filter(key => !(key in nowExt)).sort(),
  };
  const wasActs = new Map((committed.native.activities ?? []).map(activity => [activity.name, activity]));
  const nowActs = new Map(bc.native.activities.map(activity => [activity.name, activity]));
  const activities = {
    added: [...nowActs.keys()].filter(name => !wasActs.has(name)).sort(),
    removed: [...wasActs.keys()].filter(name => !nowActs.has(name)).sort(),
    changed: [...nowActs.keys()].filter(name => wasActs.has(name) && !same(wasActs.get(name), nowActs.get(name))).sort().map(name => ({
      name, fields: Object.keys({ ...wasActs.get(name), ...nowActs.get(name) }).filter(field => !same(wasActs.get(name)[field], nowActs.get(name)[field])).sort(),
    })),
  };
  const structure = ['zones', 'geometry', 'mirrors', 'poses', 'bodies', 'locks'].filter(key => !same(committed.native[key], bc.native[key]));
  const users = new Map();
  for (const activity of bc.native.activities) for (const name of new Set(activity.prerequisites.flatMap(prerequisiteNames))) {
    if (!isSupported(name, supported)) users.set(name, [...(users.get(name) ?? []), activity.name]);
  }
  const unsupportedPrerequisites = [...users].sort(([a], [b]) => a.localeCompare(b)).map(([prerequisite, names]) => ({ prerequisite, activities: names.sort() }));
  return { items, extended, activities, structure, unsupportedPrerequisites };
}

/** 純函式：函式雜湊與基準的差異。基準為 null 時不判定（只提示建立）。 */
export function compareLogic(current, baseline) {
  if (!baseline) return { baselineMissing: true, missing: current.missing, changed: [], added: [], stale: [] };
  const known = baseline.functions ?? {};
  return {
    baselineMissing: false,
    missing: current.missing,
    changed: Object.entries(current.functions).filter(([name, value]) => known[name] && known[name].hash !== value.hash)
      .map(([name, value]) => ({ name, file: value.file, was: known[name].hash, now: value.hash })).sort((a, b) => a.name.localeCompare(b.name)),
    added: Object.keys(current.functions).filter(name => !known[name]).sort(),
    stale: Object.keys(known).filter(name => !TRACKED_FUNCTIONS.includes(name)).sort(),
  };
}

export function countProblems(report) {
  const { items, extended, activities, structure, unsupportedPrerequisites, logic, warnings } = report;
  return items.missing.length + items.changed.length + extended.missing.length + extended.changed.length
    + activities.added.length + activities.removed.length + activities.changed.length + structure.length
    + unsupportedPrerequisites.length + logic.missing.length + logic.changed.length + logic.added.length + warnings.length;
}

export function buildReport({ bcDir, dataDir = DEFAULT_DATA_DIR, baselinePath = DEFAULT_BASELINE, nativeTsPath = DEFAULT_NATIVE_TS }) {
  const bc = extractNativeData(bcDir);
  const committed = { native: readJson(path.join(dataDir, 'native-data.json')), itemProperties: readJson(path.join(dataDir, 'item-properties-data.json')) };
  const metaPath = path.join(dataDir, 'bc-native-meta.json');
  const meta = fs.existsSync(metaPath) ? readJson(metaPath) : null;
  const diff = compareNative(bc, committed, supportedPrerequisites(fs.readFileSync(nativeTsPath, 'utf8')));
  const logic = compareLogic(collectFunctionHashes(bc.source.root), fs.existsSync(baselinePath) ? readJson(baselinePath) : null);
  const report = {
    version: bc.source.version,
    dataVersion: meta?.gameVersion ?? null,
    baselineVersion: logic.baselineMissing ? null : readJson(baselinePath).gameVersion ?? null,
    layout: bc.source.layout,
    counts: { items: Object.keys(bc.native.items).length, extended: Object.keys(bc.itemProperties).length, activities: bc.native.activities.length, trackedFunctions: TRACKED_FUNCTIONS.length },
    ...diff,
    logic,
    warnings: bc.warnings,
  };
  report.problems = countProblems(report);
  return report;
}

export function formatReport(report) {
  const lines = [];
  const list = (title, entries) => { if (entries.length) lines.push(`\n${title}（${entries.length}）`, ...entries.map(entry => `  - ${entry}`)); };
  lines.push(`BC 版本 ${report.version ?? '未知'}；Lite 資料版本 ${report.dataVersion ?? '無標記'}；判定函式基準版本 ${report.baselineVersion ?? '無基準'}`);
  list('缺漏的道具規則（Lite 查不到，等同放行；* = 有限制效果）', report.items.missing.map(({ key, restrictive }) => `${restrictive ? '* ' : ''}${key}`));
  list('道具規則與 BC 不同', report.items.changed.map(({ key, fields }) => `${key}（${fields.join(', ')}）`));
  list('缺漏的擴展道具設定', report.extended.missing);
  list('擴展道具設定與 BC 不同', report.extended.changed);
  list('BC 新增的活動', report.activities.added);
  list('BC 已移除的活動', report.activities.removed);
  list('活動定義與 BC 不同', report.activities.changed.map(({ name, fields }) => `${name}（${fields.join(', ')}）`));
  list('部位／姿勢／鎖等結構資料與 BC 不同', report.structure);
  list('native.ts 不認得的前置條件（該活動會被停用）', report.unsupportedPrerequisites.map(({ prerequisite, activities }) => `${prerequisite}（${activities.join(', ')}）`));
  list('找不到的 BC 判定函式', report.logic.missing);
  list('BC 判定函式內容自基準後有變動（請檢視 native.ts 的模仿邏輯）', report.logic.changed.map(({ name, file, was, now }) => `${name}（${file}）${was} → ${now}`));
  list('判定函式基準尚未收錄', report.logic.added);
  list('抽取器警告（無法忠實建模的 BC 資料）', report.warnings);
  list('僅供參考：Lite 有、BC 已沒有的道具規則（不影響判定）', report.items.removed);
  if (report.logic.baselineMissing) lines.push('\n尚未建立判定函式基準；用 --bc-dir <BC 原始碼> --update-baseline 建立。');
  lines.push(report.problems ? `\n共 ${report.problems} 項差異。` : '\n資料與判定函式皆與 BC 一致。');
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { bcDir: process.env.BC_SOURCE_DIR, dataDir: DEFAULT_DATA_DIR, baselinePath: DEFAULT_BASELINE, nativeTsPath: DEFAULT_NATIVE_TS };
  const takes = { '--bc-dir': 'bcDir', '--data-dir': 'dataDir', '--baseline': 'baselinePath', '--native-ts': 'nativeTsPath', '--json': 'json', '--report': 'report' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--update-baseline') options.update = true;
    else if (takes[argv[i]] && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) options[takes[argv[i]]] = argv[++i];
    else throw new Error(`不認得的參數或缺少值：${argv[i]}`);
  }
  if (!options.bcDir) throw new Error('未指定 BC 原始碼（用 --bc-dir 或環境變數 BC_SOURCE_DIR）');
  return options;
}

function main(argv) {
  let options;
  try { options = parseArgs(argv); } catch (error) {
    console.error(`${error.message}\n用法：BC_SOURCE_DIR=<BC 原始碼> node scripts/check-bc-native.mjs [--json 報告檔] [--report 純文字報告檔]\n      node scripts/check-bc-native.mjs --bc-dir <BC 原始碼> --update-baseline`);
    return 2;
  }
  try {
    if (options.update) {
      const { source } = extractNativeData(options.bcDir);
      const current = collectFunctionHashes(source.root);
      if (current.missing.length) throw new Error(`找不到 BC 判定函式：${current.missing.join('、')}`);
      fs.writeFileSync(options.baselinePath, JSON.stringify({ gameVersion: source.version, functions: current.functions }, null, 2) + '\n');
      console.log(`已寫入判定函式基準（BC ${source.version}，${Object.keys(current.functions).length} 個函式）：${options.baselinePath}`);
      return 0;
    }
    const report = buildReport(options);
    const text = formatReport(report);
    console.log(text);
    if (options.json) fs.writeFileSync(options.json, JSON.stringify(report, null, 2) + '\n');
    if (options.report) fs.writeFileSync(options.report, text + '\n');
    return report.problems ? 1 : 0;
  } catch (error) {
    console.error(`檢查本身失敗：${error.message}`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
