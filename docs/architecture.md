# 架構與協定筆記

## 資料路徑

```text
Cloudflare Pages（HTML / CSS / JS）
            │ 第一次載入與版本更新
            ▼
       玩家瀏覽器
            │ Socket.IO 4 / WebSocket only
            │ AccountLogin、ChatRoomSearch、ChatRoomJoin、ChatRoomChat
            ▼
Bondage Club server → 按 Origin 分配 PROD / DEV
```

Cloudflare Pages 只傳送靜態檔案。帳號、密碼、搜尋與聊天內容均由瀏覽器直接送往 BC，不經過本專案的伺服器，因為本專案根本沒有伺服器端程式。

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

- `src/protocol.ts`：唯一接觸 Socket.IO 的模組；保管短期帳密、狀態與 BC 事件。
- `src/types.ts`：Lite 實際使用的 BC 資料子集，避免把大型遊戲型別搬進來。
- `src/main.ts`：以安全 DOM API 建立畫面，不把伺服器內容寫進 `innerHTML`。
- `src/style.css`：登入、搜尋及與 BC 相容的 `chat-room-div` 響應式版面。
- `public/_headers`：Cloudflare Pages 的 CSP、權限與快取規則。

## 刻意不做的事

- 不下載或繪製角色與服裝素材。
- 不解析完整 BC 翻譯字典、活動引擎或遊戲規則。
- 不保存帳號密碼，不提供「記住我」。
- 不代理 BC 流量，不建立雲端 API 或資料庫。
- 不偽造瀏覽器無法控制的 `Origin`、`Referer` headers。

若將來要支援完整 Action／Activity 文字，建議在建置階段從相同 BC 版本擷取必要翻譯鍵，產生小型靜態 JSON；不要直接載入完整遊戲資源。
