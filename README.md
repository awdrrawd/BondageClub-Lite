# BondageClub-Lite

一個保留聊天、好友與 BEEP 的 Bondage Club 非官方輕量入口；不載入完整人物繪圖與服裝圖片。使用 Cloudflare Pages 提供前端，搭配同站 Pages Worker 中繼 BC WebSocket，不需要自行維護常駐主機。

**Relay v1：** BC 依 WebSocket Origin 分配 PROD/DEV。中繼參考 ShuangClient，在伺服器端設定官方來源；瀏覽器只連同站 `/socket.io/`。登入前先檢查中繼存在，登入後以真實 `LoginResponse.Environment` 驗證 PROD，不會自動退回直連 DEV。

完整部署與測試步驟見 [deployment-and-tests.md](docs/deployment-and-tests.md)。所有帳密及聊天流量會經過你的 Cloudflare 中繼，Worker 不記錄或儲存封包。實際 PROD 登入、多人互見與長連線仍需部署後驗收。

## 目前功能

- BC 帳號登入與自動重連
- 女性／男性／混合區、語言、滿房、鎖房與描述搜尋；隱藏是房間 Visibility 屬性
- 加入／離開聊天室及房內成員列表
- 接收 Chat、Whisper、Emote、Action、Activity 與系統訊息
- 傳送一般聊天、`/me 動作`、`*動作*`、`/w 會員編號 密語`
- 響應式手機版 `chat-room-div` 結構
- 手機底部分頁、成員抽屜、個人描述與密語／加好友／BEEP 快捷操作
- BC 好友查詢、全部／在線／不在線／未確認分頁、名字／編號篩選、好友加入／移除；前往其他房間會先確認離房
- 原生 BEEP 收發，與 FCM 一般文字互通；不處理附件、離線投遞或已讀回條
- 聊天增量更新，不因一般新訊息替換輸入框；預設 100 則 DOM，最多保留 600 則聊天／300 則 BEEP
- 翻讀紀錄時暫停更新可見聊天，點「新訊息」回到最新；「更多紀錄」每次多顯示 100 則
- 可選單張 LCE 靜態背景、字體大小與時間顯示；這些偏好存入 localStorage
- 可選「記住帳號」，僅明文儲存帳號於本站 localStorage；不存密碼，可取消或在設定頁刪除
- 搜尋／建立單區切換，房內也能搜尋；房間卡片固定高度與底部加入按鈕，顯示好友／滿房／權限／地圖標記
- 建房提供背景名稱、自訂圖片／音樂 HTTPS 網址、描述、2／5／10 人、管理者、白／黑名單、可見性、加入權限、遊戲模式、禁止類別、地圖類型／迷霧及 MapData JSON 匯入
- 頂欄玩家名稱／編號與登出；個人資料顯示主人／戀人，BIO 點擊才展開

這是文字客戶端，不載入角色繪圖、服裝圖片或活動圖像。登入後單次載入 BC 的互動／介面文字表（優先 TW、其次 CN、最後英文），以事件 Dictionary 代入玩家名稱；未知插件訊息、部分特殊資產／代名詞仍可能顯示原始鍵名。沒有換裝、道具互動、遊戲或進房後管理操作。

BIO 點擊展開時解析 BC 的 `╬` + LZ-String UTF16 格式，仍只以文字顯示。同房好友可開啟私訊（密語）；跨房使用 BEEP，不會自動切换通道。私訊草稿按對象分開保存在分頁記憶體。

新增功能的驗收步驟與 ECHO 限制見 [social-preview-tests.md](docs/social-preview-tests.md)。ECHO 並未完整載入；登入的原始 Appearance／OnlineSharedSettings 僅保留在記憶體，Lite 不重建或上傳它們。好友更新只送 FriendList，不覆蓋其他設定。不要在 Lite 期間修改服裝或期待保存他人換裝。

## 安全模型

- 本機記住帳號預設關閉，啟用後保存於 `bc-lite-account-v1`，登出仍保留；詳見 [帳號保存與資料流向](docs/privacy-and-appearance.md)。
- 帳密及遊戲流量經過 Cloudflare 中繼到 BC，不能宣稱無第三方經手。此版本未加入帳號保存 API、分析追蹤、資料庫或封包日誌；平台及實際部署設定未經審核，不能保證零收集。
- 密碼只保留在目前分頁的 JavaScript 記憶體，不寫入 localStorage、cookie、IndexedDB 或網址。
- 所有伺服器文字均以 `textContent` 建立，不執行聊天室傳入的 HTML。
- Cloudflare Pages 的 `_headers` 會限制腳本與連線來源。
- 本站仍然是可接觸 BC 帳密的第三方前端；請自行部署、檢查程式碼並只使用你信任的網址。
- BC 同一帳號只有一個連線；從 Lite 登入會讓其他 BC 分頁斷線。

## 本機開發

建置與 Worker 開發使用 Node.js 22.13+（Cloudflare 設 NODE_VERSION=22）。

```bash
npm install
npm run dev
```

上面的 Vite dev 只預覽 UI，不執行 Pages Worker。完整中繼測試：

```bash
npm run build
npm test
npm run dev:relay
```

輸出位於 `dist/`，包含 `_worker.js` 與 `_routes.json`，需要支援 Worker 的 Cloudflare Pages 部署。純 GitHub Pages 無法執行中繼。Socket.IO 固定為 `4.8.3`，使用 WebSocket-only，Worker 透明轉送升級連線與心跳。

## 免費部署：Cloudflare Pages

1. 把此專案 push 到 GitHub。
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git。
3. 選擇 `awdrrawd/BondageClub-Lite`。
4. Build command 填 `npm run build`，Build output directory 填 `dist`。
5. Pages 會自動部署輸出中的 `_worker.js`（Functions 進階模式）；無需另建 Worker 專案，也不需要任何帳密環境變數。
6. 先確認 `/api/relay-status` 回傳 JSON，再登入確認 PROD；接著測試好友與房間。

`public/_headers` 的 CSP 限制前端連線只到本站。Worker 的狀態／錯誤回應自行設定 no-store。路由只執行兩個中繼相關路徑，其餘資源不消耗 Worker 請求額度。

## 協定依據

- `BC-Bot-Deploy-Guide.md`：WebSocket-only、登入時序及事件踩坑
- Bondage Club R131 `Scripts/Messages.d.ts`、`Scripts/Server.js`、`ChatSearch.js`、`ChatRoom.js`
- `BC-LCE`：行動版聊天室版面及斷線重連行為參考
- [ShuangClient](https://gitgud.io/yeshuang26/shuangclient)：參考後端設定 Origin 的連線方式；未複製其 Python 程式碼。

事件流程與模組界線另見 [`docs/architecture.md`](docs/architecture.md)。

## 已知限制

- 尚未以真實 BC 帳密做端到端測試；登入測試需由帳號持有人手動完成。
- Lite 不載入 BC 的限制／語音轉換引擎，因此傳送文字不會模擬口塞亂碼、禁語與部分角色限制。請把目前版本視為技術預覽，不要用它規避房間規則或角色限制。
- BC 若更換伺服器網址或 Socket.IO 協定，需要同步更新 `src/protocol.ts` 與 CSP。

## 授權

本專案自有程式碼依 [MIT License](LICENSE) 發布。`socket.io-client` 為 MIT 授權。背景素材另見 [第三方說明](docs/THIRD-PARTY-NOTICES.md)，不在 Lite 自有程式的 MIT 授權範圍內；未打包 BC 人物／服裝素材。
