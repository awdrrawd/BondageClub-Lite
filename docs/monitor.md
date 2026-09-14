# 維護者負載監看（可公開）

定位以維護者日常查看負載為主，也讓其他人公開參考。這是同一份唯讀彙總資料，沒有管理者專屬權限或操作按鈕。

兩個倉庫各自部署 `/monitor/`，只看本站 Worker 用量，不連遊戲伺服器、不登入、不發聊天或測試流量。可以公開分享，但彙總數字也會透露使用規模與高峰時段；不希望公開時，把 MONITOR_ENABLED 設為 false 並重新部署。

## 直接訪問

| 專案 | 監看頁 | 網頁版操作說明 | Markdown 原文 |
| --- | --- | --- | --- |
| BC Relay | [開啟監看](https://bondageclub-relay.pages.dev/monitor/) | [操作說明](https://bondageclub-relay.pages.dev/monitor/guide.html) | [monitor.md](https://bondageclub-relay.pages.dev/monitor/monitor.md) |
| BC Lite | [開啟監看](https://bondageclub-lite.pages.dev/monitor/) | [操作說明](https://bondageclub-lite.pages.dev/monitor/guide.html) | [monitor.md](https://bondageclub-lite.pages.dev/monitor/monitor.md) |

`/monitor` 會轉向 `/monitor/`，不需要先開首頁。Markdown 原文由 `docs/monitor.md` 在組建時複製，不需另外維護；瀏覽器可能顯示原文或下載，閱讀排版請使用網頁版操作說明。上述新增路徑須在本次變更部署成功後才會生效。

監看頁可公開訪問，但只有設定好下方 Cloudflare 環境變數後才會有統計資料；未啟用不代表請求量為零。若自行部署，將網址換成自己的網域即可，統計仍只查詢該部署設定的專案。

## 提供的資料

- 今日請求（UTC）、最近 24 小時請求及 Worker 執行錯誤。
- 單次執行 CPU P50／P99（μs）、每小時請求圖與表格。
- 資料取得時間、資料缺失／未啟用／查詢失敗狀態。

不公開 Token、帳號 ID、內部 scriptName、IP、訪客、聊天或原始錯誤。只按伺服器設定的專案查詢；訪客不能改帳號、時段或 GraphQL。

數據可能延遲或抽樣，不是即時壓力、帳單、在線人數或遊戲可用性。CPU 百分位數不能加總成 CPU 總量；Worker 執行錯誤不等於 HTTP 4xx／5xx。無資料顯示未知，不以 0 代替。帳號共享的免费額度不能用單站請求推算，因此不顯示剩餘百分比。

## Cloudflare 設定（兩個專案各做一次）

1. 推送倉庫，維持原本組建指令與輸出目錄，等待部署成功。
2. Cloudflare → API Tokens → Create Token → Custom token。權限選 **Account → Account Analytics → Read**，資源只選這個 Cloudflare 帳號，不給寫入或編輯權限。記下 Token，只存進下一步的 Secret，不貼到聊天或 GitHub。
3. Workers & Pages → 選對應專案 → Settings → Variables and Secrets，設定 Production：

| 名稱 | 類型 | 值 |
| --- | --- | --- |
| MONITOR_ENABLED | 文字 | true |
| MONITOR_ACCOUNT_ID | Secret | 帳號的 32 位 Account ID |
| MONITOR_API_TOKEN | Secret | 上一步的唯讀 Token |
| MONITOR_SCRIPT_NAME | Secret | 此 Pages 專案正式環境的實際 scriptName，見下節 |
| MONITOR_DATASET | 文字，可省略 | 預設 pagesFunctionsInvocationsAdaptiveGroups；若管理頁使用 workersInvocationsAdaptive 則填該值 |

4. 儲存後重新部署。不要在 Preview 設定 Secret／啟用開關，除非你也要公開預覽統計。
5. 開啟本站 `/monitor/`。先和 Cloudflare 的相同時段比對，確認是自己的專案再分享。

### 找 scriptName 與資料集

Pages 的內部 Worker 名稱不一定等於網站名稱，**不要猜**。

- 在 Cloudflare 進入該 Pages 專案的 Functions Metrics。
- F12 → Network，搜尋 `graphql`，再重新整理統計頁。
- 查看查詢的 Payload／Variables 中 `scriptName` 篩選值（有時是 `scriptName_in` 陣列，選正式環境那一個）。
- 查詢節點若是 `pagesFunctionsInvocationsAdaptiveGroups`，維持預設；若是 `workersInvocationsAdaptive`，設定 MONITOR_DATASET。
- 只複製上述名稱，不分享 Authorization、Cookie、整份 HAR 或帳號資料。

如介面找不到，先不要亂填；可依官方 [Pages API](https://developers.cloudflare.com/api/resources/pages/) 的 Get project 結果查看 `production_script_name`。此方法需另有 Pages 唯讀權限；一般使用管理頁查詢即可，無需扩大監看 Token 權限。

### 排錯

- 尚未啟用：MONITOR_ENABLED 不是 true。
- 尚未設定：Secret 不齊、Account ID 格式或資料集設定錯誤。
- 未回傳資料：檢查 scriptName／正式環境／資料集及時段；不要當作零流量。
- 無法取得統計：檢查 Token 是否過期、Account Analytics Read 權限與帳號範圍、Cloudflare GraphQL 是否支援該資料集。公開 API 故意不回傳原始錯誤。

尚未取得此帳號的 Token，所以本次只能驗證建置及模擬 API 回應；**真實資料集與 scriptName 必須完成設定後對照 Cloudflare 驗證**。

## 快取及維護

前端每 5 分鐘更新，背景暫停；手動更新至少間隔 1 分鐘。後端成功與失敗皆快取 5 分鐘，固定 cache key 忽略不了的額外 query 直接拒絕。同一 isolate 合併同時請求，另使用邊緣快取；這不是帳號全域的硬性限流，跨節點／冷啟動仍可能有額外 API 查詢。訪客呼叫監看 API 本身也會產生 Worker 請求。

公開頁不會因讀取一次就送出一份任意 GraphQL 查詢。若有濫用，停用 MONITOR_ENABLED 或在 Cloudflare 配置存取／速率規則。快取會讓停用／設定更改最多短暫延遲。

兩倉庫的 `_monitor.js` 與 `monitor/` 保持相同副本，分別由自己的 Worker 和部署設定服務，不在瀏覽器跨站讀取 Token 或統計。

官方參考：[Workers GraphQL](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/) · [Analytics Token](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/) · [Pages Metrics](https://developers.cloudflare.com/pages/functions/metrics/)

## English summary

The public `/monitor/` page exposes only project-level request/error aggregates, CPU percentiles and hourly trends. No game probes, visitor data, internal identifiers or credentials are published. Usage patterns can still reveal traffic volume. Disable MONITOR_ENABLED if you do not want that public.

Configure a read-only Account Analytics token and the four MONITOR_* values above in each project's Production settings, then redeploy. Keep Preview disabled. Find the actual production scriptName and dataset in the Cloudflare metrics GraphQL request; do not assume the project name is the script name. Live API compatibility must be checked after configuring credentials.

Data may be delayed/sampled and is not billing, remaining shared quota or game health. CPU percentiles are not CPU totals. Missing data is unknown, not zero. The UI refreshes every five minutes; backend results and failures are cached, but caching is not a global rate limit. Only use the specific account and read-only permission; never put the token in frontend code or the repository.


## 移植到其他專案

部署站 `/monitor/guide.html` 提供中英接入說明。可複製 `_monitor.js` 與 `monitor/`，在自己的 Worker 加入 `/api/monitor` 路由並調整 `_routes.json`；不要覆蓋原有處理器。使用自己的 Account Analytics Read Token、Account ID、scriptName 與資料集，依本文件的設定步驟部署。

專案顯示名稱由 Worker 的 `monitor(request, env, '名稱')` 第三個參數指定；頁尾 Lite／Relay 連結可替換為自己的站點。兩個倉庫不互相依賴，後續移植者也不依賴原站 API。保留原始 LICENSE 要求。若不是 Cloudflare Pages advanced mode，須自行調整路由與靜態檔案綁定。

私人帳單、帳號全域數據、原始日誌或管理操作不屬於此公開頁的範圍；如需加入，應另外設置經驗證的管理入口。

## 指標與平均值

- 週平均：前 7 個完整 UTC 日的請求總量 ÷ 7。
- 月平均：前 30 個完整 UTC 日的請求總量 ÷ 30，並非當月預測或活躍日平均。
- 分母包含沒有流量的日期與部署前日期；整段 API 都沒有資料時顯示未知。
- Pages 單次查詢區間最多一週，歷史以 7+7+7+7+2 日切成五個不重疊區間，放在獨立 GraphQL 請求。歷史查詢失敗不影響 24 小時統計。
- 每次後端快取更新最多送出兩個 GraphQL HTTP 請求（主統計與歷史）；兩者並行、各有逾時限制，成功或失敗皆沿用五分鐘快取。
- 執行錯誤率為最近 24 小時 errors / requests；零請求或缺值時未知。
- 尖峰時段取最近 24 小時回傳小時資料的最大請求值，首尾小時可能未完整。
- CPU P50/P99 是單次執行的微秒百分位數，不是總 CPU 或網路延遲。
- 公開頁保留查詢失敗分類與執行錯誤總數；詳細 exception/stack 請在 Cloudflare 管理台查看，不會公開憑證或原始日誌。

Weekly/monthly cards show requests per day over the previous 7/30 complete UTC days, including inactive and pre-deployment dates. History is split into windows of at most seven days and fetched independently; unavailable history never blocks the 24-hour metrics. Invocation errors are distinct from HTTP errors and game connectivity. Raw logs remain in Cloudflare.

## 分頁與 UI 參考

- 總覽：今日、24 小時請求、執行錯誤與錯誤率，以及請求趨勢。
- 週月統計：7／30 日平均、期間總量與計算範圍。
- 錯誤：執行錯誤、錯誤率、小時錯誤趨勢與排錯說明。
- 效能：CPU P50/P99 與判讀方式；不以 CPU 推估連線延遲。
- 點擊分頁不重新呼叫 API，支援方向鍵與 Home/End 切換；方法與限制預設收合。

參考資訊層次與卡片編排，未複製程式碼或新增套件：
[Umami](https://github.com/umami-software/umami)（查閱時約 38.8k stars）、
[Plausible](https://github.com/plausible/analytics)（約 29.1k）、
[Tremor](https://github.com/tremorlabs/tremor)（約 3.6k）。星數查閱日期：2026-09-14。
