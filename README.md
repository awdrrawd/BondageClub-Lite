# BondageClub-Lite

手機連線改善：回前景主動檢查、暫時斷線後嘗試回原房一次。設定頁提供可選螢幕常亮、本機背景音訊及不含帳密／聊天的記憶體診斷。不能保證系統背景執行；詳見 [手機連線驗收](docs/mobile-connection-tests.md)。

一個保留聊天、好友與 BEEP 的 Bondage Club 非官方輕量入口；不載入完整人物繪圖與服裝圖片。使用 Cloudflare Pages 提供前端，搭配同站 Pages Worker 中繼 BC WebSocket，不需要自行維護常駐主機。

**Relay v1：** BC 依 WebSocket Origin 分配 PROD/DEV。中繼參考 ShuangClient，在伺服器端設定官方來源；瀏覽器只連同站 `/socket.io/`。登入前先檢查中繼存在，登入後以真實 `LoginResponse.Environment` 驗證 PROD，不會自動退回直連 DEV。

完整部署與測試步驟見 [deployment-and-tests.md](docs/deployment-and-tests.md)。所有帳密及聊天流量會經過你的 Cloudflare 中繼，Worker 不記錄或儲存封包。實際 PROD 登入、多人互見與長連線仍需部署後驗收。

## 目前功能

- BC 帳號登入與自動重連
- 女性／男性／混合區、語言、滿房、鎖房與描述搜尋；隱藏是房間 Visibility 屬性
- 加入／離開聊天室及房內成員列表
- 接收 Chat、Whisper、Emote、Action、Activity 與系統訊息
- 傳送一般聊天、`/me 動作`、`*動作*`、`/w 會員編號 悄悄話`、`(OOC)`、`.a 動作`
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

這是文字客戶端，不載入角色繪圖、服裝圖片或活動圖像。登入頁及設定頁可切換中文／英文，偏好只存於本機。介面字串集中在 `src/translations/ui/zh.json`、`en.json`；玩家聊天、BIO、自訂物品名不翻譯。登入後載入共用英文基底及所選語言的索引差異（中文優先 TW、其次 CN、最後英文），以事件 Dictionary 代入玩家、物品與部位名稱；未知插件訊息、部分特殊資產／代名詞仍可能顯示原始鍵名。個人資料提供部位式原生活動面板，但目前只開放可驗證條件的子集；仍未接入自身自動興奮、完整道具效果、換裝、遊戲或進房後管理操作。

手機聊天室將房名與工具按鈕分列、縮短輸入區，使用動態視窗高度與底部安全區。部署後請依 [中英文與手機驗收](docs/i18n-mobile-tests.md) 在實機測試，尤其是軟鍵盤開合。

BIO 點擊展開時解析 BC 的 `╬` + LZ-String UTF16 格式，仍只以文字顯示。同房好友可開啟私訊（密語）；跨房使用 BEEP，不會自動切换通道。私訊草稿按對象分開保存在分頁記憶體。

聊天室、悄悄話、動作與私訊支援 HTTP(S) 連結。HTTPS 圖片／影音直連，以及 YouTube、Vimeo、Spotify 的部分標準網址可內嵌。提供本次／總是許可，設定頁可撤銷；許可依實際播放器來源網域判定。影音還需點擊開啟，不自動播放，同時只保留一個播放器，可關閉釋放資源。來源服務會收到 IP、網站來源等連線資訊，內嵌服務也可能使用 Cookie 或載入其他資源；來源許可不是匿名代理。一般網頁、HTTP 媒體與無法辨識的網址保留原始連結，不嵌入任意網站。此功能參考 ACV 的按需播放器概念，不載入 ACV 插件、外部標題抓取或定時掃描。

語言選單統一放在頂部登入狀態右侧，所有分頁與登入前皆可使用。

頂欄「安全詞」提供回復本次登入外觀，或解除已知 BC 道具並離房。這是使用者確認後才允許的外觀改寫例外，不載入完整遊戲引擎；未知插件欄位保留，特殊物品連動不能保證與完整版一致。詳見 [URL 與安全詞驗收](docs/links-safeword-tests.md)。

新增功能的驗收步驟與 ECHO 限制見 [social-preview-tests.md](docs/social-preview-tests.md)。ECHO 並未完整載入；登入的原始 Appearance／OnlineSharedSettings 僅保留在記憶體，Lite 不重建或上傳它們。好友更新只送 FriendList，不覆蓋其他設定。不要在 Lite 期間修改服裝或期待保存他人換裝。

社群動作文字、獨立私聊頁（房間／好友／最近聊天）、回覆、AFC 擴展戀人、媒體來源許可與 BCX 相容召喚已接入。召喚採 Lite 允許名單＋手動確認，不是完整 BCX 強制規則；個人資料互動已改成有限的原生 Activity 面板，尚非完整 BC 引擎；詳見 [原生活動與 Lite 識別驗收](docs/chat-native-identity-tests.md)。詳見 [支援範圍與驗收清單](docs/community-features-tests.md) 及 [第三方動作文字授權](docs/third-party-dialogues.md)。

## 安全模型

- 本機記住帳號預設關閉，啟用後保存於 `bc-lite-account-v1`，登出仍保留；詳見 [帳號保存與資料流向](docs/privacy-and-appearance.md)。
- 帳密及遊戲流量經過 Cloudflare 中繼到 BC，不能宣稱無第三方經手。此版本未加入帳號保存 API、分析追蹤、資料庫或封包日誌；平台及實際部署設定未經審核，不能保證零收集。
- 密碼只保留在目前分頁的 JavaScript 記憶體，不寫入 localStorage、cookie、IndexedDB 或網址。
- 所有伺服器文字均以 `textContent` 建立，不執行聊天室傳入的 HTML。
- Cloudflare Pages 的 `_headers` 會限制腳本與連線來源。
- 本站仍然是可接觸 BC 帳密的第三方前端；請自行部署、檢查程式碼並只使用你信任的網址。
- BC 同一帳號只有一個連線；從 Lite 登入會讓其他 BC 分頁斷線。

## 原始碼與翻譯

BC 翻譯依 `messages`／`actions`／`items`／`groups` 分類；ECHO 物品與部位另放 `src/translations/items/echo/`、`groups/echo/`。`npm run catalog:items` 可更新靜態名稱擷取，不載入插件、圖片或服裝引擎。未涵蓋的動態名稱仍保留原文。

- [架構導覽 architecture.html](docs/architecture.html)：模組邊界、資料流、安全限制與開發流程；建置後提供 `/docs/architecture.html`。
- [翻譯貢獻指南](src/translations/README.md)：UI、BC、插件、人工覆寫分開，不必複製整份 BC 文字表。
- `src/main.ts` 是入口；介面在 `src/ui/`，Socket 在 `src/network/`，擴展動作在 `src/action/`；其他模組依責任分為 profile、media、safety、platform、shared。
- `npm run build`／`npm run dev` 會先從本倉庫翻譯來源產生 `src/action/generated/`，不需要上游插件目錄。開發服務運行期間修改翻譯後，另跑 `npm run catalog:compile`。

## 本機開發

建置與 Worker 開發使用 Node.js 22.13+（Cloudflare 設 NODE_VERSION=22）。

```bash
npm install
npm run dev
```

### 免登入、離線 UI 預覽

首次安裝相依套件後執行：

```bash
npm run dev:ui
```

開啟 `http://127.0.0.1:5173/ui-preview.html`（若連接埠被占用，以終端機輸出為準）。這個入口使用同一套 Lite UI，注入 `src/preview/client.ts` 的虛構角色、房間與訊息，不使用真實帳號、不連接 BC。可測試搜尋、加入／建立房間、私聊、互動面板、回覆、語系、3000 則訊息與模擬斷線。外部圖片、影音與播放器被預覽專用 CSP 阻擋；連線恢復、原生活動效果與真正的影音播放仍需另作整合測試。顯示偏好仍會保存在本機瀏覽器。

建議用瀏覽器開發工具切換 390px 手機和桌面寬度，檢查長房名、長訊息、輸入區、聯絡人切換與捲動。`ui-preview.html` 不納入正式 `npm run build`，不會提供公開的假登入入口。

上面的 Vite dev 不執行 Pages Worker。完整中繼測試：

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
- BC 若更換伺服器網址或 Socket.IO 協定，需要同步更新 `src/network/client.ts` 與 CSP。

## 授權

本專案自有程式碼依 [MIT License](LICENSE) 發布。`socket.io-client` 為 MIT 授權。背景素材另見 [第三方說明](docs/THIRD-PARTY-NOTICES.md)，不在 Lite 自有程式的 MIT 授權範圍內；未打包 BC 人物／服裝素材。
