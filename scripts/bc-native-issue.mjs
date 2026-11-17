// 讀取 check-bc-native.mjs --json 的報告，只用 GitHub Issue「通知」，不讓工作流程失敗。
//   - 有差異：開（或更新）一則 label=bc-native 的 issue；內容沒變就不重複打擾。
//   - 已恢復：在原 issue 留言並關閉。
// 需要 gh CLI 與 GH_TOKEN（issues: write）。做法與 HSC 的 bc-compat-issue.mjs 相同。
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const MAX_LISTED = 40; // GitHub issue 內文上限約 65536 字元；超過的項目只列數量，完整清單在報告 artifact／本機重跑。
const reportPath = process.argv[2];
if (!reportPath) { console.error('用法：node scripts/bc-native-issue.mjs <report.json>'); process.exit(2); }
const r = JSON.parse(readFileSync(reportPath, 'utf8'));
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });

const items = r.items ?? { missing: [], changed: [] }, extended = r.extended ?? { missing: [], changed: [] }, activities = r.activities ?? { added: [], removed: [], changed: [] };
const logic = r.logic ?? { missing: [], changed: [], added: [] };
const sections = [
  ['缺漏的道具規則（Lite 查不到，等同放行；* = 有限制效果）', items.missing.map(({ key, restrictive }) => `${restrictive ? '* ' : ''}${key}`)],
  ['道具規則與 BC 不同', items.changed.map(({ key, fields }) => `${key}（${fields.join(', ')}）`)],
  ['缺漏的擴展道具設定', extended.missing],
  ['擴展道具設定與 BC 不同', extended.changed],
  ['BC 新增的活動', activities.added],
  ['BC 已移除的活動', activities.removed],
  ['活動定義與 BC 不同', activities.changed.map(({ name, fields }) => `${name}（${fields.join(', ')}）`)],
  ['部位／姿勢／鎖等結構資料與 BC 不同', r.structure ?? []],
  ['native.ts 不認得的前置條件（該活動會被停用）', (r.unsupportedPrerequisites ?? []).map(({ prerequisite, activities: names }) => `${prerequisite}（${names.join(', ')}）`)],
  ['找不到的 BC 判定函式', logic.missing],
  ['BC 判定函式內容自基準後有變動（請檢視 native.ts 的模仿邏輯）', logic.changed.map(({ name, file, was, now }) => `${name}（${file}）${was} → ${now}`)],
  ['判定函式基準尚未收錄', logic.added],
  ['抽取器警告（無法忠實建模的 BC 資料）', r.warnings ?? []],
].map(([title, entries]) => [title, [...entries].sort()]).filter(([, entries]) => entries.length);
const problems = sections.reduce((sum, [, entries]) => sum + entries.length, 0);
const sig = createHash('sha1').update(JSON.stringify([r.version, sections])).digest('hex').slice(0, 12);

const list = entries => entries.slice(0, MAX_LISTED).map(x => `- \`${x}\``).join('\n') + (entries.length > MAX_LISTED ? `\n- …另 ${entries.length - MAX_LISTED} 項（在本機執行檢查腳本可看完整清單）` : '');
const body = `<!-- bc-native-sig:${sig} -->
每週 BC 判定資料檢查（鏡像版本 **${r.version}**，Lite 資料版本 **${r.dataVersion ?? '無標記'}**，比對 ${r.counts?.items ?? '?'} 件道具、${r.counts?.extended ?? '?'} 個擴展設定、${r.counts?.activities ?? '?'} 項活動）發現下列差異。
${sections.map(([title, entries]) => `\n### ${title}（${entries.length}）\n${list(entries)}\n`).join('')}
> 這只是提醒，不影響部署與腳本運作。Lite 查不到的道具不會貢獻任何 Effect／Block，所以缺漏的限制道具會被放行，這類差異不能長期擱置。
> 鏡像可能是 BETA 或領先線上版本；是否真的影響線上，請在實際連線的遊戲版本中確認。
> 處理方式見 docs/automation.md 的「BC 判定資料落後檢查」：重新產生資料、審查差異後提交；若只有判定函式變動，檢視 native.ts 後再更新基準。
> 此 issue 會在內容改變時更新，差異消失後自動關閉。`;

try { gh('label', 'create', 'bc-native', '--color', 'FBCA04', '--description', 'BC 判定資料落後提醒'); } catch {}
const open = JSON.parse(gh('issue', 'list', '--label', 'bc-native', '--state', 'open', '--json', 'number,body', '--limit', '1'));
const existing = open[0];
const tmp = process.env.RUNNER_TEMP ? process.env.RUNNER_TEMP + '/bc-native-body.md' : 'bc-native-body.md';

if (problems) {
  writeFileSync(tmp, body);
  if (!existing) {
    gh('issue', 'create', '--title', 'BC 判定資料落後提醒（每週檢查）', '--label', 'bc-native', '--body-file', tmp);
    console.log(`已建立 issue（${r.version}，${problems} 項差異）`);
  } else if ((existing.body || '').includes(`bc-native-sig:${sig}`)) {
    console.log('差異與上次相同，不重複通知。');
  } else {
    gh('issue', 'edit', String(existing.number), '--body-file', tmp);
    gh('issue', 'comment', String(existing.number), '--body', `檢查結果有變動（鏡像版本 ${r.version}，${problems} 項差異），內文已更新。`);
    console.log(`已更新 issue #${existing.number}`);
  }
} else if (existing) {
  gh('issue', 'comment', String(existing.number), '--body', `鏡像版本 ${r.version} 已無差異，自動關閉。`);
  gh('issue', 'close', String(existing.number));
  console.log(`差異已消失，已關閉 issue #${existing.number}`);
} else {
  console.log(`BC ${r.version}：無差異。`);
}
