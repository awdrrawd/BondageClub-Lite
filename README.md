# BondageClub-Lite

非官方 Bondage Club 文字客戶端，保留聊天、房間、好友與 BEEP，不載入人物繪圖、服裝圖片或完整遊戲引擎。TypeScript + DOM 前端由 Cloudflare Pages 提供，同站 Pages Worker 中繼 BC WebSocket。

[文件導覽](docs/README.md) · [架構說明](docs/architecture.md) · [架構網頁](docs/architecture.html) · [部署與驗收](docs/deployment-and-tests.md)

## 功能與範圍

- BC 登入、PROD 驗證、自動重連及登入後回房一次；前景連線探測、可選常亮與本機背景音訊。
- 女性／男性／混合區搜尋、篩選、排序、分頁及建房；建房支援權限、管理者、名單、背景代號、自訂媒體 URL 與 MapData 匯入。
- Chat、Whisper、Emote、Action、Activity 與系統訊息；可用 `/me`、`*動作*`、`/w 編號 內容`、`(OOC)`、`.a 動作`。
- 好友查詢／增刪、私聊、普通 BEEP、回覆與最近聯絡人；草稿按對象分開，不提供附件、離線投遞、推播或送達／已讀回條。
- 私訊依玩家顯示本次工作階段未讀數、第一則未讀定位及手動標記已讀；BEEP／悄悄話各自設定通知音效，預設關閉。
- 本機歷史可依關鍵字、玩家、房間、日期與頻道搜尋，每頁 50 筆，點擊查看同房間或同對話上下文。
- 暫時斷線保留聊天畫面與草稿，停用送出；重新進房後由使用者手動送出。
- 中英文介面與靜態動作文字；玩家聊天、BIO、房名、自訂物品名保留原文。BIO 按需解壓，發送者分享的 Dictionary.Original 可附在收到的混淆文字後。
- 個人資料、部位式原生活動、擴展文字動作、AFC 房間查詢、手動確認的 BCX 相容召喚及 Lite 自報識別。
- 安全詞與 ECHO 貼貼是經使用者確認的外觀改寫例外；一般操作保留未知外觀資料，不載入插件引擎。
- HTTP(S) 連結，HTTPS 圖片／影音直連及部分 YouTube／Vimeo／Spotify 內嵌；先許可實際播放器來源，影音再點擊開啟，不自動播放，同時只保留一個播放器。
- 同房同步局部更新，保留輸入框與未變動訊息節點。房間即時紀錄預設 3000 則、DOM 每批 100 則；私訊 DOM 每頁 60 則，歷史快取有上限並支援雙向載入。
- IndexedDB 保存本機訊息（預設 7 天）及最近聯絡人（30 天），可縮短／關閉、清除或按日匯出 TXT／HTML／Excel (.xlsx)；此保存期限與畫面顯示上限分開。

目前沒有衣櫃、地圖移動、完整活動效果、自身自動興奮／表情或完整插件規則。Lite actor policy 不模擬自身所有束縛／語音限制，不能視為完整版 BC 的角色限制引擎。詳細能力與驗收依[文件導覽](docs/README.md)查閱。

## 資料與信任

帳密及所有遊戲流量均經 Cloudflare Worker 到 BC；Worker 不新增封包日誌或資料庫，但不能由原始碼保證平台與部署者的資料處理。只使用你信任的部署。

密碼只留目前分頁記憶體。記住帳號是自選的 localStorage 明文名稱；顯示、媒體許可、數量／期限偏好及最近房名也使用 localStorage。**聊天歷史另存於本機 IndexedDB 明文資料庫**，預設啟用，不能宣稱登出就刪除所有紀錄。保存界線與刪除方式見[隱私與外觀](docs/privacy-and-appearance.md)、[本機紀錄](docs/local-history-and-contacts.md)。

玩家內容使用安全 DOM API，不執行聊天 HTML。獲許可的外部媒體直接連來源，來源可能接收 IP、使用 Cookie 或載入次級資源；這不是匿名代理。同帳號另處登入會讓原連線中斷。

## 本機開發

依本專案相依套件使用 Node.js 22.13+；Cloudflare 建置設定 NODE_VERSION=22。

```sh
npm ci
npm run build
npm test
npm run dev:ui
```

`dev:ui` 開啟免登入虛構資料預覽，重用正式 UI、不連 BC、不開歷史 IndexedDB。可測房間列表、3000 則訊息、中文輸入與模擬斷線；外部媒體由預覽 CSP 阻擋，顯示偏好仍會留在本機。此入口不納入正式建置。

`npm run dev` 只提供 Vite 前端，沒有 Pages Worker；完整本機中繼測試需先建置，再執行 `npm run dev:relay`。另可執行 `node scripts/smoke-relay.mjs` 測握手，不送 AccountLogin。

build／dev 前置步驟會從本庫翻譯來源建立 `src/action/generated/`；開發服務運行中修改翻譯需另跑 `npm run catalog:compile`。更新上游才需擷取脚本及本機來源倉庫，見[翻譯貢獻指南](src/translations/README.md)。

## 部署

Cloudflare Pages：Build command `npm run build`，output `dist`。輸出包含 `_worker.js`／`_routes.json`，純 GitHub Pages 不能提供中繼。先檢查 `/api/relay-status`，再由帳號持有人驗證實際登入為 PROD、雙向聊天與長連線。

[部署與驗收](docs/deployment-and-tests.md)提供操作順序及排錯。自動測試使用模擬 socket、happy-dom 與 fake-indexeddb，不能取代真實 BC、手機鍵盤或插件觀看端驗收。

## 授權

Lite 自有程式依 [MIT License](LICENSE)。第三方圖片、BC 文字、插件文字及圖示依各來源授權，不一律適用 Lite 的 MIT；見[第三方素材](docs/THIRD-PARTY-NOTICES.md)、[第三方動作文字](docs/third-party-dialogues.md)與 [licenses](docs/licenses/)。
