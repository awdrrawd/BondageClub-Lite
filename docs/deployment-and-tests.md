# 開發、部署與驗收

[文件導覽](README.md) · [架構導覽（HTML）](https://github.com/awdrrawd/BondageClub-Lite/blob/Mater/docs/architecture/index.html)

## 本機開發

使用 Node.js 22.13+；Cloudflare 建置設定 NODE_VERSION=22。

```sh
npm ci
npm run build
npm test
npm run dev:ui
```

- `dev:ui` 使用虛構資料，不登入 BC、不開歷史 IndexedDB；可檢查版面、輸入與模擬斷線。外部媒體由預覽 CSP 阻擋，顯示偏好仍留在本機；預覽入口不納入正式建置。
- `npm run dev` 只有 Vite 前端，沒有 Pages Worker。完整本機中繼測試需先建置，再執行 `npm run dev:relay`。
- build／dev 前置步驟會編譯本庫翻譯來源；服務運行中修改翻譯後，另跑 `npm run catalog:compile`。擷取上游文字見[翻譯貢獻指南](../src/translations/README.md)。

## 部署結構

沿用現有 Cloudflare Pages，使用進階模式的 `dist/_worker.js`。不必建立另一個 Worker 網址、修改 DNS 或提供 API token。`_routes.json` 只把 `/socket.io/*` 和 `/api/relay-status` 交給 Worker，其餘頁面和素材由 Pages 直接提供。

連線現在是：瀏覽器 → 同網址 `/socket.io/` → Cloudflare Worker → BC。Worker 建立新握手並指定 `Origin: https://bondageprojects.elementfx.com`（參考 ShuangClient），不轉送瀏覽器 Cookie 或 Authorization；不解析、不記錄、不儲存帳密和聊天封包。登入後的所有聊天流量仍持續經過 Cloudflare，不是只代理登入一次。

來源相同檢查只限制其他網站借用中繼，不能阻擋自訂非瀏覽器程式；上游網址固定，不能透過參數變成任意代理。先限個人測試，再依實際用量決定是否開放多人使用。未配置額外資料庫、帳密環境變數或保活排程。

## 你要做的部署設定

1. 將要部署的版本提交至你的 Git 倉庫。包含 `public/_worker.js`、`public/_routes.json`、src、package.json 和 lockfile；不用提交 dist/node_modules。
2. Cloudflare Pages 選擇實際要發布的 Production branch；Build command `npm run build`，Output directory `dist`，Root directory 指向本專案根目錄；Node 版本使用 `NODE_VERSION=22`。不要把歷史部署的分支名稱當成固定要求。
3. 不用建立獨立 Workers 專案。Pages 會識別輸出根目錄中的 `_worker.js`，部署為 Pages Functions 進階模式。這一版已經有雲端運算部分；舊文件的「純靜態、不需要 Functions」不再適用。
4. 若曾設定 `SKIP_DEPENDENCY_INSTALL` 或只安裝 production dependencies，取消該自訂設定，以便建置 Vite/TypeScript。
5. 不需要設定 `BC_ORIGIN`，程式有預設值。若你曾自行設定，先移除錯誤值，或將 Production 及 Preview 的該值設為 `https://bondageprojects.elementfx.com`（無 www、版本路徑或尾斜線）。它不是 BC 帳密。變更後重新部署。
6. 等新部署成功，關掉舊 Lite 分頁，再開正式網址。清除舊頁面快取或強制重新整理，頁尾應顯示 `Relay v1`。

相關平台文件：[Pages 進階模式](https://developers.cloudflare.com/pages/functions/advanced-mode/)、[WebSocket](https://developers.cloudflare.com/workers/runtime-apis/websockets/)。部署配額與服務限制請依實際平台設定核對；本文件不保證無限用量或永不斷線。

## 建置觸發範圍

純 MD／一般 docs／測試變更可略過自動建置；部署用的架構 HTML／CSS 保留觸發。需在 Cloudflare 後台設定，完整規則見[建置觸發範圍](cloudflare-builds.md)。

## 測試順序與通過標準

### 1. 確認 Worker 已部署（不用登入）

在你的部署網址開啟 `/api/relay-status`。應顯示 JSON，包含：

```json
{"service":"bc-lite-relay","version":1,"transport":"websocket","bcOrigin":"https://bondageprojects.elementfx.com"}
```

JSON 另有 upstream 與 note。這只證明中繼程式存在，不能證明 PROD。

若顯示 Lite HTML、404 或舊頁面，表示 Worker／路由未部署；先查看建置與 Functions 部署記錄，確認輸出包含 `_worker.js` 和 `_routes.json`，不要先測帳密。

### 2. 確認連線走中繼

電腦瀏覽器 F12 → Network → WS，登入時應看到同網站的 `/socket.io/?EIO=4&transport=websocket`，狀態 101。瀏覽器不應再直接連 `bondage-club-server.herokuapp.com`。

### 3. 正式環境登入（最重要）

使用測試帳號登入，畫面必須顯示 `伺服器登入環境：PROD`。若為 DEV，停止後續測試，提供環境文字、relay-status 與部署版本；不以建立房間嘗試切換環境。首次真實驗收前，不能聲稱已成功進入 PROD。

### 4. 好友在線（先不進房）

用另一個已互加好友的帳號在官方 BC 查詢，手動刷新好友列表；應能看到 Lite 帳號在線。勿使用相同帳號開官方 BC，否則會踢掉 Lite。即使 Lite 未進房，也要驗證好友可見，避免誤把進房當成必要條件。

### 5. 公開與隱藏房間

- 混合區、語言全部、勾選滿房和鎖房，空白搜尋應回傳公開房間。分別驗證女性／男性／混合區；不能要求冷門區必定有房。
- 用官方端建立或指定一個已知隱藏房，選相同區域、取消語言限制、填完整房名後搜尋。結果仍受封鎖與房間權限限制。
- 加入已知公開測試房，確認房名、成員及官方端的進房通知。

### 6. 建房與雙向訊息

- 建立獨特名稱的公開混合房，確認進房成功；請另一個官方帳號搜尋並加入。
- 雙向傳送普通文字、中文輸入法、`/me 測試動作`、`/w 編號 測試密語`。
- 普通聊天/動作應雙向可見，密語只送給對象，自己的密語顯示一次。Action/Activity 的完整翻譯仍屬既有功能限制。
- 手機點「離開」後能回搜尋頁；官方端應看到離房。

### 7. 重連、維持連線與登出

- 暫時斷網約 10 秒再恢復，應重新登入並確認 PROD，嘗試回原房一次；失敗停止，不循環加入。完整優先序與抑制條件見[登入回房](mobile-connection-tests.md#登入回房)。
- 在測試房保持前景 10–15 分鐘，檢查雙向訊息仍能傳送。
- 測試另一處登入同帳號：Lite 應停止重試並顯示重複登入，而不是反覆搶登。
- 登出後 WebSocket 應關閉，好友列表刷新後顯示離線。

## 排錯回報

請提供目前網址、relay-status 的 JSON、PROD/DEV 文字、狀態提示、失敗步驟及 WebSocket HTTP 狀態。

| 狀態 | 排查方向 |
|---|---|
| relay-status 是 HTML/404 | Worker 未部署，或仍在舊部署 |
| 403 | 請求 Origin 不符本站，或 Cloudflare Access/WAF 攔截 |
| 400 | 握手不是 EIO=4 + websocket，或帶了未支援參數 |
| 426 | 用普通 HTTP 打開 WebSocket 路徑；瀏覽器需 WebSocket Upgrade |
| 502 | Worker 無法升級 BC 上游連線；查看回應錯誤碼 |
| 101 但 DEV | 上游環境判定仍未通過，不能當正式登入 |
| PROD 但零房間 | 再核對區域、篩選、完整房名與伺服器回應 |

不要貼完整 LoginResponse、AccountLogin 或未清理的 HAR，裡面可能包含帳密、個人資料或聊天內容。中繼程式刻意不記錄這些內容。

## 驗收記錄

自動測試不登入 BC；握手測試也不代表 PROD 登入或長連線已驗收。真人測試請記錄部署 commit、裝置、時間、結果及未通過項目。完整本機流程見本頁「本機開發」，握手測試可執行 `node scripts/smoke-relay.mjs`，不傳送 AccountLogin。

## 使用者腳本的 CSP 樣式警告

正式站使用 style-src self，只載入本站樣式檔。若錯誤來源為 userscript.html，先停用該站的使用者腳本後重新整理，以確認是否由擴充腳本插入內嵌樣式造成。畫面正常時不需為單一腳本放寬整站 CSP；畫面異常則檢查 Console 的來源與行號。Lite 的樣式修改放在 src/ui/style.css；不為外部腳本加入 unsafe-inline。
