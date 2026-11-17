// 解析 Bondage Club 原始碼目錄，同時支援舊版（R133 以前）與 R134 的檔案佈局。
//   舊：Assets/Female3DCG/Female3DCG.js、Assets/Female3DCG/Female3DCGExtended.js
//   新：Assets/Female3DCG.js、Assets/Female3DCGExtended.js
// 來源可以是程式碼鏡像（根目錄有 Scripts/、Assets/）、上游倉庫（內含 BondageClub/），
// 或舊版 CLI 用法傳入的 Female3DCG.js 檔案路徑。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const LAYOUTS = [
  { name: 'r134', female: 'Assets/Female3DCG.js', extended: 'Assets/Female3DCGExtended.js' },
  { name: 'legacy', female: 'Assets/Female3DCG/Female3DCG.js', extended: 'Assets/Female3DCG/Female3DCGExtended.js' },
];
const COMMON = {
  pose: 'Scripts/Pose.js',
  vibrator: 'Scripts/VibratorMode.js',
  slaveCollar: 'Screens/Inventory/ItemNeck/SlaveCollar/SlaveCollar.js',
  game: 'Scripts/Game.js',
  inventoryScreens: 'Screens/Inventory',
};

function candidateRoots(input) {
  const start = resolve(input);
  const roots = [];
  let dir = statSync(start).isFile() ? dirname(start) : start;
  // 檔案路徑最多往上找 4 層；目錄則檢查自身與其 BondageClub/ 子目錄。
  for (let i = 0; i < (statSync(start).isFile() ? 4 : 1); i++, dir = dirname(dir)) roots.push(dir, join(dir, 'BondageClub'));
  return roots;
}

/** @returns {{root:string, layout:string, files:Record<string,string>, version:string|null}} */
export function resolveBcSource(input) {
  if (!input || !existsSync(input)) throw new Error(`找不到 BC 原始碼：${input ?? '（未指定）'}`);
  for (const root of candidateRoots(input)) {
    const layout = LAYOUTS.find(l => existsSync(join(root, l.female)) && existsSync(join(root, l.extended)));
    if (!layout || !existsSync(join(root, COMMON.pose))) continue;
    const files = { female: join(root, layout.female), extended: join(root, layout.extended) };
    for (const [key, path] of Object.entries(COMMON)) files[key] = join(root, path);
    const missing = ['pose', 'vibrator', 'slaveCollar'].filter(key => !existsSync(files[key]));
    if (missing.length) throw new Error(`BC 原始碼缺少必要檔案：${missing.map(key => COMMON[key]).join('、')}`);
    return { root, layout: layout.name, files, version: readGameVersion(root) };
  }
  throw new Error(`無法辨識 BC 原始碼佈局（需要 Assets/Female3DCG.js 或 Assets/Female3DCG/Female3DCG.js，以及 Scripts/Pose.js）：${input}`);
}

/** 讀 `var GameVersion = "R134"`；找不到時回傳 null，不猜測。 */
export function readGameVersion(root) {
  const scripts = join(root, 'Scripts');
  if (!existsSync(scripts)) return null;
  const preferred = join(scripts, 'Game.js');
  const files = [preferred, ...readdirSync(scripts).filter(f => f.endsWith('.js')).map(f => join(scripts, f))].filter(existsSync);
  for (const file of files) {
    const match = /\b(?:var|let|const)\s+GameVersion\s*=\s*["'](R\d+[\w.-]*)["']/.exec(readFileSync(file, 'utf8'));
    if (match) return match[1];
  }
  return null;
}

/** CHANGELOG 開頭記錄的更新日期與最後 commit，僅作為資料來源標記。 */
export function readChangelogStamp(root) {
  const file = join(root, 'CHANGELOG.md');
  if (!existsSync(file)) return {};
  const head = readFileSync(file, 'utf8').slice(0, 4000);
  const date = /Changelog last updated:\s*(\d{4}-\d{2}-\d{2})/.exec(head)?.[1];
  const commit = /Last recorded commit hash:\s*`([0-9a-f]{7,40})`/.exec(head)?.[1];
  return { ...(date ? { changelogDate: date } : {}), ...(commit ? { changelogCommit: commit } : {}) };
}
