import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveBcSource } from '../scripts/bc-source.mjs';
import { extractNativeData } from '../scripts/native-extract.mjs';
import { buildReport, collectFunctionHashes, crc32, hashSource, supportedPrerequisites, TRACKED_FUNCTIONS } from '../scripts/check-bc-native.mjs';
import { makeBcSource, TRACKED } from './bc-native-fixture.mjs';
import { activityInventoryReason, definitions } from './native-helper.mjs';

const NATIVE_TS = 'src/action/native.ts';
const tmp = [];
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), 'bc-native-')); tmp.push(dir); return dir; };
test.after(() => { for (const dir of tmp) rmSync(dir, { recursive: true, force: true }); });

/** 建立一份 BC 來源，並把「現在的抽取結果」寫成 Lite 資料與基準，代表資料已同步。 */
function synced(options) {
  const dir = scratch(), bc = makeBcSource(join(dir, 'bc'), options), data = join(dir, 'data');
  mkdirSync(data);
  const { native, itemProperties } = extractNativeData(bc);
  writeFileSync(join(data, 'native-data.json'), JSON.stringify(native));
  writeFileSync(join(data, 'item-properties-data.json'), JSON.stringify(itemProperties));
  writeFileSync(join(data, 'bc-native-meta.json'), JSON.stringify({ gameVersion: 'R134' }));
  const baselinePath = join(dir, 'baseline.json');
  writeFileSync(baselinePath, JSON.stringify({ gameVersion: 'R134', functions: collectFunctionHashes(bc).functions }));
  return { dir, bc, data, baselinePath, report: () => buildReport({ bcDir: bc, dataDir: data, baselinePath, nativeTsPath: NATIVE_TS }) };
}

test('BC source resolver supports the R134 and legacy layouts, upstream roots and legacy file paths', () => {
  const dir = scratch();
  const modern = makeBcSource(join(dir, 'modern')), legacy = makeBcSource(join(dir, 'legacy'), { layout: 'legacy', version: 'R133' });
  assert.deepEqual([resolveBcSource(modern).layout, resolveBcSource(modern).version], ['r134', 'R134']);
  assert.deepEqual([resolveBcSource(legacy).layout, resolveBcSource(legacy).version], ['legacy', 'R133']);
  mkdirSync(join(dir, 'upstream'));
  makeBcSource(join(dir, 'upstream', 'BondageClub'));
  assert.equal(resolveBcSource(join(dir, 'upstream')).layout, 'r134');
  assert.equal(resolveBcSource(join(legacy, 'Assets/Female3DCG/Female3DCG.js')).root, legacy);
  assert.equal(resolveBcSource(join(modern, 'Assets/Female3DCG.js')).root, modern);
  assert.throws(() => resolveBcSource(join(dir, 'missing')), /找不到 BC 原始碼/);
  mkdirSync(join(dir, 'empty'));
  assert.throws(() => resolveBcSource(join(dir, 'empty')), /無法辨識 BC 原始碼佈局/);
});

test('the extractor gives the same data for both layouts and resolves shared modular modules', () => {
  const dir = scratch();
  const modern = extractNativeData(makeBcSource(join(dir, 'a'))), legacy = extractNativeData(makeBcSource(join(dir, 'b'), { layout: 'legacy' }));
  assert.deepEqual(modern.native, legacy.native);
  assert.deepEqual(modern.itemProperties, legacy.itemProperties);
  assert.deepEqual(modern.warnings, []);
  const stool = modern.itemProperties['ItemDevices/BarStool'];
  assert.equal(stool.unknown, undefined);
  // 選項 0 是「無貼紙」，之後每個單層、非 Extended 的貼紙一項（3 個），Extended 與多層貼紙不算。
  assert.deepEqual(stool.modules.map(module => [module.key, module.options.length]), [['p', 2], ['d', 4]]);
  assert.deepEqual(stool.modules[1].options.map(option => option.property), [{}, {}, {}, {}]);
});

test('shared modules the extractor cannot model degrade to unknown with a warning instead of crashing', () => {
  for (const [sharedModule, pattern] of [['unknown', /InventoryItemDevicesBarStoolMysteryModule.*getter/], ['missing', /InventoryItemDevicesNoSuchModule.*找不到宣告/]]) {
    const result = extractNativeData(makeBcSource(join(scratch(), 'bc'), { sharedModule }));
    assert.equal(result.itemProperties['ItemDevices/BarStool'].unknown, true);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], pattern);
  }
});

test('hash matches ModSDK CRC32 and ignores CRLF line endings', () => {
  assert.equal(crc32('123456789'), 'CBF43926');
  assert.equal(hashSource('a\r\nb'), hashSource('a\nb'));
  const functions = collectFunctionHashes(makeBcSource(join(scratch(), 'bc')));
  assert.deepEqual(Object.keys(functions.functions).sort(), [...TRACKED_FUNCTIONS].sort());
  assert.deepEqual(functions.missing, []);
  assert.deepEqual(Object.fromEntries(Object.entries(functions.functions).map(([name, value]) => [name, value.file])), TRACKED);
});

test('a synced Lite data set produces no differences', () => {
  const { report } = synced();
  const result = report();
  assert.equal(result.problems, 0);
  assert.equal(result.version, 'R134');
  assert.equal(result.dataVersion, 'R134');
});

test('missing, changed and removed item rules are reported, with restrictive ones marked', () => {
  const state = synced();
  makeBcSource(state.bc, { extraItem: true, ropeBlock: ['ItemHands', 'ItemMouth'], hugPrerequisite: 'UseHands' });
  const result = state.report();
  assert.deepEqual(result.items.missing, [{ key: 'ItemArms/NewCuffs', restrictive: true }]);
  assert.deepEqual(result.items.changed, []);
  assert.deepEqual(result.extended.changed, ['ItemArms/NylonRope']);
  assert.ok(result.problems >= 2);
  // 反向：BC 移除道具只是參考資訊，不算差異。
  const reverse = synced({ extraItem: true });
  makeBcSource(reverse.bc, { extraItem: false });
  const removed = reverse.report();
  assert.deepEqual(removed.items.removed, ['ItemArms/NewCuffs']);
  assert.equal(removed.problems, 0);
});

test('item rule changes list the fields that differ', () => {
  const state = synced();
  const asset = join(state.bc, 'Assets/Female3DCG.js');
  writeFileSync(asset, readFileSync(asset, 'utf8').replace('{ Name: "NylonRope", Effect: [E.Block] }', '{ Name: "NylonRope", Effect: [E.Block, E.Freeze], Expose: ["ItemArms"] }'));
  assert.deepEqual(state.report().items.changed, [{ key: 'ItemArms/NylonRope', fields: ['Effect', 'Expose'] }]);
});

test('new and changed activities, and prerequisites that native.ts does not support, are reported', () => {
  const state = synced();
  makeBcSource(state.bc, { hugPrerequisite: 'TotallyNewPrerequisite' });
  const result = state.report();
  assert.deepEqual(result.activities.changed, [{ name: 'Hug', fields: ['prerequisites'] }]);
  assert.deepEqual(result.unsupportedPrerequisites, [{ prerequisite: 'TotallyNewPrerequisite', activities: ['Hug'] }]);
  const asset = join(state.bc, 'Assets/Female3DCG.js');
  writeFileSync(asset, readFileSync(asset, 'utf8').replace('];\nvar PoseFemale3DCG', '  { Name: "Fresh", ActivityID: 3, Target: ["ItemArms"], Prerequisite: ["Needs-FreshItem"] },\n];\nvar PoseFemale3DCG'));
  const added = state.report();
  assert.deepEqual(added.activities.added, ['Fresh']);
  assert.ok(!added.unsupportedPrerequisites.some(entry => entry.activities.includes('Fresh')), 'Needs- prefix is supported');
});

test('structural data (zones, poses) drift is reported', () => {
  const state = synced();
  const asset = join(state.bc, 'Assets/Female3DCG.js');
  writeFileSync(asset, readFileSync(asset, 'utf8').replace('ArousalZoneID: 1', 'ArousalZoneID: 2').replace('Category: "BodyLower"', 'Category: "BodyUpper"'));
  assert.deepEqual(state.report().structure, ['zones', 'poses']);
});

test('extractor warnings count as differences so unmodelled BC data is never silent', () => {
  // 資料與 BC 完全同步（含 unknown 標記），唯一的差異就是抽取器警告：它自己必須算成問題。
  const state = synced({ sharedModule: 'unknown' });
  const result = state.report();
  assert.equal(result.warnings.length, 1);
  assert.deepEqual([result.items.missing, result.items.changed, result.extended.missing, result.extended.changed].map(list => list.length), [0, 0, 0, 0]);
  assert.equal(result.problems, 1);
});

test('a changed BC judgment function is reported once, a missing baseline is not a failure by itself', () => {
  const state = synced();
  makeBcSource(state.bc, { functionBody: { ActivityCheckPrerequisite: 'function ActivityCheckPrerequisite(a, b) {\n\treturn a !== b;\n}\n' } });
  const result = state.report();
  assert.equal(result.logic.changed.length, 1);
  assert.equal(result.logic.changed[0].name, 'ActivityCheckPrerequisite');
  assert.equal(result.logic.changed[0].file, 'Scripts/Activity.js');
  assert.notEqual(result.logic.changed[0].was, result.logic.changed[0].now);
  // 只有空白／註解以外的內容才影響雜湊：CRLF 轉換不算變動。
  const unchanged = synced();
  const file = join(unchanged.bc, 'Scripts/Server.js');
  writeFileSync(file, readFileSync(file, 'utf8').replaceAll('\n', '\r\n'));
  assert.equal(unchanged.report().logic.changed.length, 0);
  rmSync(unchanged.baselinePath);
  const noBaseline = unchanged.report();
  assert.equal(noBaseline.logic.baselineMissing, true);
  assert.equal(noBaseline.problems, 0);
  // 函式被 BC 移除或改名時要提醒。
  const renamed = synced();
  makeBcSource(renamed.bc, { functionBody: { CharacterGetEffects: 'function CharacterGetEffectsRenamed() {}\n' } });
  assert.deepEqual(renamed.report().logic.missing, ['CharacterGetEffects']);
});

test('CLI exit codes: 0 in sync, 1 on drift, 2 on usage or parse errors; report files are written', () => {
  const state = synced();
  const run = (...args) => spawnSync(process.execPath, ['scripts/check-bc-native.mjs', ...args], { encoding: 'utf8', env: { ...process.env, BC_SOURCE_DIR: '' } });
  const common = ['--bc-dir', state.bc, '--data-dir', state.data, '--baseline', state.baselinePath, '--native-ts', NATIVE_TS];
  const ok = run(...common, '--json', join(state.dir, 'ok.json'), '--report', join(state.dir, 'ok.txt'));
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(readFileSync(join(state.dir, 'ok.json'), 'utf8')).problems, 0);
  assert.match(readFileSync(join(state.dir, 'ok.txt'), 'utf8'), /一致/);
  makeBcSource(state.bc, { extraItem: true });
  const drift = run(...common, '--json', join(state.dir, 'drift.json'));
  assert.equal(drift.status, 1);
  assert.match(drift.stdout, /\* ItemArms\/NewCuffs/);
  assert.equal(JSON.parse(readFileSync(join(state.dir, 'drift.json'), 'utf8')).items.missing[0].key, 'ItemArms/NewCuffs');
  assert.equal(run().status, 2, 'no BC source given');
  assert.equal(run('--bc-dir', state.bc, '--bogus').status, 2, 'unknown option');
  assert.equal(run('--bc-dir').status, 2, 'missing value');
  assert.equal(run('--bc-dir', join(state.dir, 'nope'), '--data-dir', state.data).status, 2, 'unreadable source');
  writeFileSync(join(state.data, 'native-data.json'), '{ broken');
  assert.equal(run(...common).status, 2, 'unparsable committed data');
});

test('--update-baseline rewrites only the judgment function baseline', () => {
  const state = synced();
  const baseline = join(state.dir, 'new-baseline.json');
  const result = spawnSync(process.execPath, ['scripts/check-bc-native.mjs', '--bc-dir', state.bc, '--baseline', baseline, '--update-baseline'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const written = JSON.parse(readFileSync(baseline, 'utf8'));
  assert.equal(written.gameVersion, 'R134');
  assert.deepEqual(Object.keys(written.functions).sort(), [...TRACKED_FUNCTIONS].sort());
  assert.ok(!existsSync(join(state.dir, 'native-data.json')));
});

// ───────────── issue 通知（以假的 gh 驗證，不連 GitHub）─────────────
function fakeGh() {
  const dir = scratch(), state = join(dir, 'issues.json'), calls = join(dir, 'calls.jsonl');
  writeFileSync(state, '[]'); writeFileSync(calls, '');
  const script = join(dir, 'gh');
  writeFileSync(script, `#!/usr/bin/env node
const fs = require('fs'); const [a, b, ...rest] = process.argv.slice(2);
const read = () => JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'));
const flag = name => rest[rest.indexOf(name) + 1];
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify([a, b]) + '\\n');
if (a === 'issue' && b === 'list') process.stdout.write(JSON.stringify(read()));
if (a === 'issue' && b === 'create') fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify([{ number: 7, body: fs.readFileSync(flag('--body-file'), 'utf8') }]));
if (a === 'issue' && b === 'edit') fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify([{ number: 7, body: fs.readFileSync(flag('--body-file'), 'utf8') }]));
if (a === 'issue' && b === 'close') fs.writeFileSync(${JSON.stringify(state)}, '[]');
`);
  chmodSync(script, 0o755);
  const sent = () => readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line).join(' '));
  const run = report => {
    const file = join(dir, 'report.json');
    writeFileSync(file, JSON.stringify(report));
    const before = sent().length;
    const result = spawnSync(process.execPath, ['scripts/bc-native-issue.mjs', file], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RUNNER_TEMP: dir } });
    assert.equal(result.status, 0, result.stderr);
    return { out: result.stdout.trim(), calls: sent().slice(before).filter(call => !/^issue list|^label create/.test(call)), issues: JSON.parse(readFileSync(state, 'utf8')) };
  };
  return { run };
}
const reportOf = (patch = {}) => ({ version: 'R134', dataVersion: 'R132', counts: { items: 10, extended: 5, activities: 2 }, items: { missing: [], changed: [] }, extended: { missing: [], changed: [] }, activities: { added: [], removed: [], changed: [] },
  structure: [], unsupportedPrerequisites: [], logic: { missing: [], changed: [], added: [] }, warnings: [], ...patch });

test('issue notifier creates, deduplicates, updates and closes — without ever failing the workflow', () => {
  const gh = fakeGh();
  const drift = reportOf({ items: { missing: [{ key: 'ItemDevices/GiantJar', restrictive: true }], changed: [] } });
  const created = gh.run(drift);
  assert.deepEqual(created.calls, ['issue create']);
  assert.match(created.issues[0].body, /bc-native-sig:[0-9a-f]{12}/);
  assert.match(created.issues[0].body, /\* ItemDevices\/GiantJar/);
  assert.match(created.issues[0].body, /docs\/automation\.md 的「BC 判定資料落後檢查」/);
  assert.deepEqual(gh.run(drift).calls, [], 'identical report must not notify again');
  const changed = gh.run(reportOf({ items: { missing: [{ key: 'ItemDevices/GiantJar', restrictive: true }, { key: 'ItemArms/NewCuffs', restrictive: true }], changed: [] } }));
  assert.deepEqual(changed.calls, ['issue edit', 'issue comment']);
  assert.match(changed.issues[0].body, /NewCuffs/);
  const closed = gh.run(reportOf());
  assert.deepEqual(closed.calls, ['issue comment', 'issue close']);
  assert.deepEqual(gh.run(reportOf()).calls, [], 'nothing to do when clean and no issue is open');
});

test('issue notifier caps very long lists so the body stays within GitHub limits', () => {
  const gh = fakeGh();
  const many = Array.from({ length: 500 }, (_, i) => ({ key: `ItemArms/Item${String(i).padStart(3, '0')}`, restrictive: false }));
  const { issues } = gh.run(reportOf({ items: { missing: many, changed: [] } }));
  assert.match(issues[0].body, /另 460 項/);
  assert.ok(issues[0].body.length < 20000);
});

test('issue notifier requires a report argument', () => {
  assert.equal(spawnSync(process.execPath, ['scripts/bc-native-issue.mjs'], { encoding: 'utf8' }).status, 2);
});

// ───────────── 已提交資料本身的健全性（不需要 BC 原始碼，每次 CI 都會跑）─────────────
test('committed native data carries a BC version stamp and only uses prerequisites native.ts understands', () => {
  const meta = JSON.parse(readFileSync('src/action/bc-native-meta.json', 'utf8'));
  assert.match(meta.gameVersion, /^R\d+/);
  const supported = supportedPrerequisites(readFileSync(NATIVE_TS, 'utf8'));
  const names = prerequisite => typeof prerequisite === 'string' ? [prerequisite] : [...(prerequisite.all ?? []), ...(prerequisite.any ?? []), ...(prerequisite.not ? [prerequisite.not] : [])].flatMap(names);
  const unsupported = definitions.activities.flatMap(activity => activity.prerequisites.flatMap(names).filter(name => !supported.has(name) && !/^(?:Target)?Needs-/.test(name)).map(name => `${activity.name}:${name}`));
  assert.deepEqual(unsupported, [], '重新產生資料後出現 native.ts 不認得的前置條件，需要在 native.ts 補上');
  const baseline = JSON.parse(readFileSync('scripts/bc-native-baseline.json', 'utf8'));
  assert.deepEqual(Object.keys(baseline.functions).sort(), [...TRACKED_FUNCTIONS].sort());
  for (const value of Object.values(baseline.functions)) assert.match(value.hash, /^[0-9A-F]{8}$/);
});

test('items missing from the data contribute no restrictions, which is why drift matters; known restrictive items still block', () => {
  const wearing = (...items) => ({ MemberNumber: 1, Name: 'T', AssetFamily: 'Female3DCG', Appearance: [{ Group: 'BodyUpper', Name: definitions.bodies.BodyUpper[0] }, ...items],
    ArousalSettings: { Active: 'Manual', Zone: 'f'.repeat(30), Activity: 'z'.repeat(100) } });
  const target = { ...wearing(), MemberNumber: 2 };
  // 資料收錄的限制道具（R134 新增的 GiantJar 帶 OneWayEnclose）會封鎖對他人的動作。
  assert.ok(definitions.items['ItemDevices/GiantJar'].Effect.includes('OneWayEnclose'));
  assert.equal(activityInventoryReason(wearing({ Group: 'ItemDevices', Name: 'GiantJar' }), target, 'ItemArms', ['UseHands']), 'native.blocked');
  assert.equal(activityInventoryReason(wearing({ Group: 'ItemArms', Name: 'NylonRope' }), target, 'ItemArms', ['UseHands']), 'native.blocked');
  assert.equal(activityInventoryReason(wearing(), target, 'ItemArms', ['UseHands']), null);
});

test('SiblingsNeutral follows BC: same owner and either side not SheHer/HeHim, with SheHer as the default', () => {
  const person = (id, ...items) => ({ MemberNumber: id, Name: 'T', AssetFamily: 'Female3DCG', Ownership: { MemberNumber: 99, Stage: 0 }, Appearance: [{ Group: 'BodyUpper', Name: definitions.bodies.BodyUpper[0] }, ...items.map(Name => ({ Group: 'Pronouns', Name }))] });
  const check = (a, b) => activityInventoryReason(a, b, 'ItemArms', ['SiblingsNeutral']);
  assert.equal(check(person(1), person(2)), 'native.blocked', 'no pronoun item means SheHer for both');
  assert.equal(check(person(1, 'SheHer'), person(2, 'HeHim')), 'native.blocked');
  assert.equal(check(person(1, 'TheyThem'), person(2)), null);
  assert.equal(check(person(1), person(2, 'ItIts')), null);
  const stranger = person(2, 'TheyThem'); stranger.Ownership.MemberNumber = 100;
  assert.equal(check(person(1, 'TheyThem'), stranger), 'native.blocked', 'different owners are not siblings');
  const unowned = person(2, 'TheyThem'); delete unowned.Ownership;
  assert.equal(check(person(1, 'TheyThem'), unowned), 'native.blocked');
});
