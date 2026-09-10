# 架構與協定筆記

完整導覽見 [architecture.html](../architecture.html)，翻譯擴充見 [翻譯貢獻指南](../src/translations/README.md)。本頁保留協定查證筆記；目前目錄以 HTML 導覽為準。

## 資料路徑

```text
Cloudflare Pages（HTML / CSS / JS）
            │ 第一次載入與版本更新
            ▼
       玩家瀏覽器
            │ 同站 /socket.io/（WebSocket only）
            ▼
  Pages Worker 設定上游 Origin，透明轉送
            ▼
Bondage Club server → 按 Origin 分配 PROD / DEV
```

Relay v1 的 Cloudflare Pages 包含 `_worker.js` 伺服器端程式。帳密、搜尋和聊天封包均經過中繼；程式不解析／儲存內容，以原樣返回上游 101 回應讓 Cloudflare 自動橋接 WebSocket，避免自行實作 Engine.IO 心跳及二進位轉送。

瀏覽器登入前檢查 `/api/relay-status`，確認中繼存在；環境判定仍以 LoginResponse.Environment 為準。詳見 [部署與測試](deployment-and-tests.md)。

## 登入狀態機

### 環境隔離（2026-09-09 查證）

公開伺服器 [app.js](https://github.com/Ben987/Bondage-Club-Server/blob/master/app.js) 的 `AccountGetEnvironment` 比對 `socket.request.headers.origin` 與 `ChatRoomProduction`（部署環境變數 PRODUCTION0…16）。匹配為 PROD；非空但不匹配為 DEV。

`AccountLoginProcess` 設定 `result.Environment` 後才發送 LoginResponse；OnLogin 已在此之前註冊房間與帳號操作，未見第二階段遊戲認證。AccountUpdate 不是切換 PROD 的步驟。

`AccountQuery` 的好友結果需符合 `OtherAcc.Environment == Acc.Environment`；`ChatRoomSearch` 排除 `Acc.Environment !== room.Environment`。好友不在聊天室時仍可產生 friendInfo，進房不是顯示在線的普遍前提。

ServerInfo 的 OnlinePlayers 是 Account.length，並非當前環境人數，且連線初期也會發送，不能當作正式環境认证。正式部署可能與公開程式碼版本不同，應再核對實際 LoginResponse.Environment；本客戶端只讀取這個單一欄位，不記錄完整帳號資料。

普通搜尋與完整名稱搜尋由伺服器處理：完整房名可以越過 Visibility 篩選，但環境、區域、封鎖、語言等條件依然生效。瀏覽器 JavaScript 不能自行指定 WebSocket Origin；Pages 的 CSP/CORS、帳號更新和額外 query 參數不能取代伺服器來源名單。

```text
idle → connecting → authenticating → waiting-server → ready
          ▲                                  │          │
          └──────── reconnecting ────────────┘          ▼
                                                   joining → in-room
                                                               │
                                                               └→ ready (leave)
```

`LoginResponse` 與 `ServerInfo` 都到達後才進入 `ready`。Socket.IO 斷線重連後會以記憶體內帳密重新發出 `AccountLogin`；使用者登出、登入失敗、重複登入或重新整理頁面時，記憶體內密碼會消失。

## 使用的 BC 事件

| 方向 | 事件 | 用途 |
|---|---|---|
| Client → Server | `AccountLogin` | 登入 |
| Server → Client | `LoginQueue` / `LoginResponse` / `ServerInfo` | 登入與伺服器就緒狀態 |
| Client → Server | `ChatRoomSearch` | 搜尋房間；房名使用 `Query` |
| Server → Client | `ChatRoomSearchResult` | 房間列表 |
| Client → Server | `ChatRoomJoin` / `ChatRoomLeave` | 加入與離開 |
| Server → Client | `ChatRoomSearchResponse` / `ChatRoomSync*` | 加入結果、房間及成員同步 |
| Client → Server | `ChatRoomChat` | 傳送 Chat、Whisper、Emote |
| Server → Client | `ChatRoomMessage` | 接收聊天室訊息；Hidden 不顯示 |
| Server → Client | `ForceDisconnect` | 限流或重複登入 |

## 模組界線

- `src/network/client.ts`：唯一接觸 Socket.IO 的模組；保管短期帳密、狀態與 BC 事件。
- `src/shared/types.ts`：Lite 實際使用的 BC 資料子集，避免把大型遊戲型別搬進來。
- `src/ui/app.ts`：以安全 DOM API 建立畫面，不把伺服器內容寫進 `innerHTML`。
- `src/ui/style.css`：登入、搜尋及與 BC 相容的 `chat-room-div` 響應式版面。
- `public/_headers`：Cloudflare Pages 的 CSP、權限與快取規則。

## 刻意不做的事

- 不下載或繪製角色與服裝素材。
- 只載入建置擷取的文字表，不載入完整活動引擎或遊戲規則。
- 可選記住帳號名稱，但密碼只留分頁記憶體；不持久保存密碼。
- 不建立資料庫或紀錄 BC 帳密／聊天封包。
- 瀏覽器不改寫 Origin；伺服器端 Worker 使用與 ShuangClient 相同的上游 Origin。

目前 Action／Activity 文字處理由 `src/action/` 負責；翻譯來源在 `src/translations/`，建置後合併共用基底與語言差異，不直接載入插件或完整 BC 執行資源。
