# GitHub 與 Cloudflare 自動化

[文件導覽](README.md) · [架構導覽（HTML）](https://bondageclub-lite.pages.dev/docs/architecture/)

## 倉庫已提供

- **CI / Verify**：PR、推送 Mater、手動執行時驗證。純 Markdown／一般 docs 只檢查本機連結；程式、測試、工作流程及 docs/architecture/ 變更會安裝依賴、建置並跑測試。無法判定變更時跑完整驗證。
- **Dependabot**：每週六台北時間 08:10 檢查 npm 與 GitHub Actions；minor／patch 分組，major 個別 PR，不自動合併；新版本發布滿 7 天才提出（安全性更新不受影響）。
- **Site health**：手動檢查正式站首頁、/docs/architecture/ 和 /api/relay-status。檢查內容與 HTTP 狀態，不登入 BC，也不證明 PROD 登入或 WebSocket 正常。
- 本機完整驗證：先執行 npm ci，再執行 npm run ci。只檢查文件可用 npm run check:docs；線上健康檢查用 npm run check:site。

文件檢查涵蓋本機 Markdown 連結、圖片及參照目的地是否存在；不連網檢查外部網址，也不驗證標題錨點。一般 CI 與 Site health 僅要求 contents: read；BC 資料更新另需 contents／pull-requests 寫入權限以提出 PR。不需要 BC 帳密、Cloudflare Token 或自動合併權限。

Wrangler 4.151.3 的 Miniflare 固定依賴 undici 7.29.1，Dependabot 無法直接升級這個間接依賴。本庫升級至 Wrangler 4.153.0，由新版 Miniflare 直接使用已修補的 undici 7.30.1。遇到類似鎖定依賴問題，先確認上游開發工具版本，更新後執行 `npm ci`、`npm audit`、`npm run ci` 驗證。

若所有測試顯示通過卻沒有最後總結，可能是測試程序尚有存活資源。npm test 對每個測試程序設定 60 秒診斷期限；逾時會輸出 TEST WORKER TIMEOUT、測試檔、Node／平台及資源建立堆疊，並以失敗退出。GitHub 與 Cloudflare 都適用；這是診斷與等待上限，不代表已修復資源洩漏。

## GitHub 手動設定

1. 提交並推送這次變更。到倉庫 **Actions → CI** 確認 Verify 成功。手動工作流程與 Dependabot 設定需存在於預設分支；目前工作流程的 push 分支為 Mater，若變更主要分支請同步調整。
2. 如果 Actions 被停用，到 **Settings → Actions → General** 啟用；允許 actions/checkout 與 actions/setup-node。Workflow permissions 保持唯讀即可。
3. 建議到 **Settings → Rules → Rulesets → New branch ruleset**，目標選 Mater、Enforcement 選 Active，啟用 **Require a pull request before merging** 與 **Require status checks to pass**，加入曾成功跑過的 **Verify**。個人維護可不要求額外審核人；啟用後日常修改改走分支及 PR。
4. 到 **Settings → Advanced Security**（部分介面顯示 Code security 或 Code security and analysis），啟用 **Dependabot alerts** 與 **Dependabot security updates**。每週版本更新由倉庫設定檔提供；更新 PR 仍需查看 CI 結果並自行合併。

CI 整個工作流程不使用 paths 過濾，讓文件 PR 仍能取得 Verify 成功結果，避免必要檢查一直 Pending。規則是否可用依倉庫可見度與 GitHub 方案而定。

## Cloudflare 手動設定

1. **Workers & Pages → bondageclub-lite → Settings → Builds / Builds & deployments → Build configuration**：Build command 改成 **npm run ci**，Build output directory 保持 **dist**，Root directory 為專案根目錄。
2. 在建置環境變數設定 **NODE_VERSION = 24**，不要略過依賴安裝，也不要只安裝 production dependencies。建置失敗或測試失敗便不發布新版。
3. 在 **Build watch paths** 套用[建置觸發規則](cloudflare-builds.md)的 Include／Exclude 清單；倉庫 JSON 不會自動同步到後台。
4. **Branch control**：Production branch 核對為要發布的 Mater。Preview 可選 **Custom branches**，只納入需要測試的分支，例如 codex/*；不需要預覽可停用 Preview deployments。
5. 若預覽不想公開，可在 Preview deployments 的 **Enable access policy** 啟用 Cloudflare Access，並核對 Zero Trust Access 允許登入的人。這是選配；測試預覽時需先登入 Access。
6. 新版部署成功後，到 GitHub **Actions → Site health → Run workflow** 執行正式站檢查。失敗時開啟該次 run 查看失敗路徑；剛部署可等待完成後重跑。

Cloudflare 的 Git 整合不會因 GitHub CI 尚未完成就自動等待，因此後台建置也要用 npm run ci。Site health 目前是手動執行，沒有定時排程，也不假設 Cloudflare 會發出 GitHub deployment_status 事件。後台設定需由管理者儲存，新增倉庫檔案不代表已套用。

## English summary

CI validates local Markdown links on every PR and push to Mater. Code, tests, workflow changes and deployable architecture files also trigger dependency installation, build and tests. Weekly Dependabot updates group minor/patch releases and wait 7 days after a release (security updates are not delayed); major updates stay separate and nothing auto-merges.

Push these files, confirm the Verify check, then optionally require it in a branch ruleset. Enable Dependabot alerts/security updates in repository settings. In Cloudflare Pages, set the build command to **npm run ci**, output to **dist**, Node to **24**, and apply the documented build watch paths manually. Limit preview branches and optionally protect previews with Access. After deployment, run **Actions → Site health → Run workflow**. No credentials are needed; this checks public pages and relay metadata, not BC login.

平台文件：[GitHub 工作流程觸發](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)、[Dependabot 版本更新](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates)、[Cloudflare 建置路徑](https://developers.cloudflare.com/pages/configuration/build-watch-paths/)、[預覽部署與 Access](https://developers.cloudflare.com/pages/configuration/preview-deployments/)。

## 安全檢查

Security checks（`security.yml`）在 PR、推送 Mater、每週一臺灣時間 10:30 與手動時執行：`npm audit`（隨網站發布的正式相依有 high 以上漏洞才失敗，開發工具只提醒）、CodeQL 靜態分析；PR 另有 dependency review，擋下帶有已知 high 以上漏洞的新相依。CodeQL 警報在 Security 分頁查看。若倉庫已啟用 CodeQL 的 Default setup，請先改成 Advanced 或停用，否則上傳結果會衝突。

## BC 原生文字每月更新

BC text data update 工作流程每月 5、10、15、20、25、30 日臺灣時間 11:23（沒有 30 日的月份略過該次） 檢查，也可在 Actions 手動 Run workflow。排程時間可能受 GitHub 排隊影響。來源是 awdrrawd/Bondage-College-Mirror 的 bondageclub 分支；每次先取得 commit，再下載該 commit 的 CSV／翻譯 TXT。

只產生 src/translations/bc 的訊息、動作敘述、道具與部位名稱更新。沒有差異不建立 PR；已有 codex/bc-data- 開頭的待審 PR 則暫停新提案。PR 記錄來源 commit，通過建置及測試後才建立，不自動合併。人工 overrides、通訊、native-data 的活動／道具限制、插件程式皆保持人工維護。

PR 同時列出新增／變更的待審校動作文字。已審校來源的完整翻譯檢查照常執行；新來源暫用上游譯文或英文回退，過期的人工覆寫不再覆蓋新版來源。人工審校紀錄的維護方式見[翻譯貢獻指南](../src/translations/README.md#bc-自動更新與人工審校)。

推送工作流程至預設分支後，到 Settings → Actions → General → Workflow permissions，允許 GitHub Actions 建立 Pull requests。此工作流程單獨要求 contents／pull-requests 寫入權限，其他 CI 保持唯讀；不需要額外 Token。Bot PR 的 CI 可能要求點選 Approve workflows to run，核對檢查通過才合併。若政策禁止建立 PR，工作流程會失敗，不會直接修改 Mater。

English: Text-only synchronization on days 5, 10, 15, 20, 25 and 30 of each month opens a reviewed PR from a pinned mirror commit. No auto-merge, protocol changes, native item/activity rules, plugin code or manual overrides. Enable Actions PR creation and approve the bot PR's checks when prompted.

## BC 判定資料落後檢查

BC native data check 工作流程每週一臺灣時間 11:41 執行，也可在 Actions 手動 Run workflow。它不產生 PR、不改資料，只在發現差異時開（或更新）一則 label 為 `bc-native` 的 issue，差異消失後自動關閉；內容沒變不會重複通知。檢查腳本本身壞掉（結束碼 2）才讓工作流程失敗。來源預設與文字更新相同（awdrrawd/Bondage-College-Mirror 的 bondageclub 分支），可用 Actions Variables 的 `BC_SOURCE_REPO`、`BC_SOURCE_REF` 覆蓋，只取檢查需要的腳本與資產定義檔。

為什麼需要：`native-data.json` 與 `item-properties-data.json` 是事先從 BC 抽取後提交的，文字更新工作流程不會碰它們。Lite 查不到的道具不會貢獻任何 Effect／Block，所以 BC 新增的限制道具（例如 `ItemDevices/GiantJar` 的 `Block`、`OneWayEnclose`）在資料更新前會被放行，而不是被保守封鎖。

檢查兩層，抽取邏輯與產生器共用同一份（`scripts/native-extract.mjs`），所以「檢查器認為的正確答案」就是「重新產生後會寫入的內容」：

- **資料層**：缺漏或規則不同的道具、缺漏或不同的擴展道具設定、新增／移除／變動的活動、部位／姿勢／鎖等結構資料，以及 `native.ts` 不認得的前置條件（該活動會被停用，方向安全但活動無法使用）。抽取器無法忠實建模的 BC 資料（例如沒有登記重建方式的共用 module）會列為警告，相關道具標為 unknown，判定退回保守路徑。
- **邏輯層**：`native.ts`、`appearance-state.ts` 註解中引用、手工模仿的 BC 函式（`ActivityCheckPrerequisite`、`CharacterGetEffects`、`InventoryGetItemProperty`、`PoseRefresh`、`AssetParsePosePrerequisite`、`ServerChatRoomGetAllowItem`），其內容雜湊與 `scripts/bc-native-baseline.json` 不同時提醒檢視。算法與 HSC 的 BC compatibility 相同。基準只記錄建立當下的函式內容，不代表當時已逐行核對過模仿邏輯。

本機執行：`BC_SOURCE_DIR=<BC 原始碼> npm run check:bc-native`（或 `-- --bc-dir <BC 原始碼>`）。BC 原始碼可為程式碼鏡像或上游倉庫，R134 前後兩種檔案佈局都支援。結束碼 0 = 一致、1 = 有差異、2 = 用法或解析錯誤。`--json`、`--report` 可輸出報告檔。

收到 issue 之後：

1. 重新產生資料：`npm run catalog:native -- <BC 原始碼>`。會同時寫入 `native-data.json`、`item-properties-data.json` 與版本標記 `src/action/bc-native-meta.json`；抽取器警告會印在終端機。
2. 用 `git diff` 審查差異再提交；資料是活動與道具限制的判定依據，不要未經審查就合併。
3. 報告列出 `native.ts` 不認得的前置條件時，需在 `native.ts` 補上對應判定（參照 BC 的 `ActivityCheckPrerequisite`）。`npm test` 內的 native 資料測試也會檢查已提交的活動是否都有被認得的前置條件。
4. 報告列出判定函式變動時，先對照 BC 新舊函式檢視 `native.ts` 與 `appearance-state.ts`，確認後執行 `npm run check:bc-native -- --bc-dir <BC 原始碼> --update-baseline` 更新基準並提交。

限制：檢查只比對靜態資料與函式文字，不能證明判定行為與線上遊戲一致，也沒有使用真實帳號驗證。同一個 R 版本內鏡像仍會持續新增道具，所以資料版本相同不代表沒有差異，檢查以內容比對為準，版本標記只供參考。

English: A weekly, notify-only workflow compares the committed native data against the BC mirror and opens a `bc-native` issue on drift, closing it when resolved. Regenerate with `npm run catalog:native -- <BC source>`, review the diff, then commit. Function-hash drift is checked against `scripts/bc-native-baseline.json`; update it with `--update-baseline` after reviewing `native.ts`.
