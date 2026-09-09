# BC Offline Message Bot — 部署說明

## 概述

本 Bot 運行在 Render 上，透過 WebSocket 連線到 BC 伺服器，接收玩家傳來的離線訊息並在目標玩家上線時投遞。

---

## 一、前置準備

### 1. 建立 BC Bot 帳號
- 到 BC 官網正常註冊一個新帳號，這個帳號專門給 Bot 使用
- 記下帳號的 **MemberNumber**（登入後在個人資料頁可以看到）
- 帳號不需要特殊設定，但建議設一個好認的名稱

### 2. 建立 Render 帳號
- 前往 [render.com](https://render.com) 註冊帳號
- 免費方案即可，但注意**免費方案服務閒置 15 分鐘後會休眠**
- 需要搭配 cron-job 服務定時 ping 來保持連線（見第四節）

### 3. 準備 GitHub 倉庫
- 將 Bot 程式碼推送到 GitHub 公開或私有倉庫
- Render 會從 GitHub 自動部署

---

## 二、Bot 程式碼結構

```
bc-offline-bot/
├── index.js        ← 主程式（Bot 邏輯 + HTTP server）
├── package.json    ← 依賴設定
├── render.yaml     ← Render 部署設定
└── data/           ← 自動建立，存放 messages.json（注意：Render 免費方案重啟後會消失）
```

### package.json
```json
{
  "name": "bc-offline-bot",
  "version": "0.1.0",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "socket.io-client": "4.6.2"
  },
  "engines": {
    "node": ">=18"
  }
}
```

### render.yaml
```yaml
services:
  - type: web
    name: bc-offline-bot
    runtime: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: BC_USERNAME
        sync: false
      - key: BC_PASSWORD
        sync: false
```

---

## 三、Render 部署步驟

### 1. 建立 Web Service
1. 登入 Render → 點擊 **New** → **Web Service**
2. 連結你的 GitHub 倉庫
3. 設定如下：
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

### 2. 設定環境變數
在 Render Dashboard → 你的 Service → **Environment** 頁面加入：

| 變數名稱 | 說明 |
|---------|------|
| `BC_USERNAME` | Bot 帳號的登入名稱（AccountName） |
| `BC_PASSWORD` | Bot 帳號的密碼 |

> ⚠️ 密碼會加密儲存，不會明文顯示

### 3. 部署
- 點擊 **Manual Deploy** 或 push 到 GitHub 自動觸發
- 查看 Log 確認以下訊息依序出現：
  ```
  [HTTP] port 10000
  [Bot] 偵測到 BC 版本: R128
  [Bot] 取得 sid: xxxx
  [Bot] 已連線，登入中...
  [Bot] 登入成功 MemberNumber=245991
  [Bot] 收到 ServerInfo (players=xxxx)
  [Bot] 搜尋房間中...
  [Bot] 建立新房間... 或 [Bot] 加入房間中...
  [Bot] 房間就緒
  ```

---

## 四、保活設定（重要）

Render 免費方案 15 分鐘無流量會讓服務休眠，Bot 連線會斷掉。

### 使用 cron-job.org 保活
1. 前往 [cron-job.org](https://cron-job.org) 註冊
2. 新增一個 Cronjob：
   - **URL**: `https://你的服務名稱.onrender.com/ping`
   - **Interval**: 每 10 分鐘
3. 儲存後啟用

Bot 的 `/ping` endpoint 會回傳 `pong`，讓 Render 知道服務還活著。

---

## 五、BC 連線機制說明

Bot 連線到 BC 的流程與正常玩家登入相同：

1. **偵測版本號** — 從 BC 首頁抓取當前版本（如 R128），動態生成 Referer header，避免進入測試服
2. **WebSocket 連線** — 使用 `socket.io-client` 連到 `wss://bondage-club-server.herokuapp.com/`，並帶上正確的 `Origin` 和 `Referer` header
3. **登入** — 收到 `connect` 事件後發送 `AccountLogin`
4. **進入房間** — 收到 `ServerInfo` 後搜尋並加入/建立隱藏房間（`Space: "X"`），**這步是關鍵，沒進房間就收不到 Beep**
5. **心跳** — 每 25 秒發送 `AccountUpdate` 維持連線

### 關鍵參數
```javascript
// 連線設定
const sio = io("https://bondage-club-server.herokuapp.com", {
    transports  : ["websocket"],
    upgrade     : false,
    reconnection: false,
    extraHeaders: {
        "Origin" : "https://www.bondageprojects.elementfx.com",
        "Referer": `https://www.bondageprojects.elementfx.com/${version}/BondageClub/`,
    },
});
```

> ⚠️ 如果不帶 `Origin` 和 `Referer`，BC 伺服器會把你導向測試服，玩家前台看不到 Bot 上線

---

### 握手踩坑紀錄

BC 使用 socket.io 作為通訊框架，在 Node.js 環境下有幾個非直覺的地方：

**❌ 錯誤做法 1：手刻 WebSocket + 舊版 Engine.IO 握手**
```javascript
// 不要這樣做
ws.send("2probe");  // 收到 3probe 後送 5
// 伺服器會在送完 5 之後直接斷線（code 1005）
```

**❌ 錯誤做法 2：polling 取得 sid 後直接跳 WebSocket**
```javascript
// 先 polling 拿 sid，再開 ws 連
const wsUrl = `wss://...?sid=${sid}`;
// 伺服器不接受這種跳法，連上後不會送 40 就斷線
```

**✅ 正確做法：直接用 `socket.io-client` 4.6.2**
```javascript
const sio = io("https://bondage-club-server.herokuapp.com", {
    transports  : ["websocket"],
    upgrade     : false,       // 不做 polling → websocket 升級
    reconnection: false,       // 自己處理重連
    extraHeaders: {
        "Origin" : "https://www.bondageprojects.elementfx.com",
        "Referer": referer,    // 帶版本號的完整路徑
    },
});
```

> ⚠️ `socket.io-client` 版本要固定在 **4.6.2**，其他版本未測試

---

### 正確的登入時序

登入後不能立刻進房間，必須等 `ServerInfo` 事件，否則 `ChatRoomSearch` 會被忽略，然後因為沒進房間被伺服器踢掉：

```
connect 事件 → AccountLogin
     ↓
LoginResponse（登入成功）→ AccountUpdate（帶基本外觀）
     ↓
ServerInfo（伺服器準備好的信號）→ ChatRoomSearch → ChatRoomCreate/Join
     ↓
ChatRoomSync（確認進入房間）→ 開始接收 Beep
```

```javascript
sio.on("ServerInfo", data => {
    if (botId && !roomJoined) {
        roomJoined = true;
        joinOrCreateRoom();  // 這裡才進房間
    }
});
```

---

### 房間搜尋參數

```javascript
// ❌ 錯誤：用 Name 不會有回應
sio.emit("ChatRoomSearch", { Space: "X", Name: ROOM_NAME, Limit: 10 });

// ✅ 正確：用 Query
sio.emit("ChatRoomSearch", { Space: "X", Query: ROOM_NAME, Limit: 10 });
```

> ⚠️ 用 `Name` 參數搜尋不會收到 `ChatRoomSearchResult` 回應，必須用 `Query`

---

## 六、Beep 通訊說明

BC 的 Beep 系統有以下限制需要注意：

| 情況 | 能否 Beep |
|------|----------|
| 雙方在同一房間 | ✅ |
| 好友關係 | ✅ |
| 陌生人、不同房間 | ❌ |

**本 Bot 的解決方案：使用 `BeepType: "Leash"`**

BC 內建的 `Leash` 類型 Beep 不受好友限制，可以跨房間發送。插件端和 Bot 端都使用這個類型。

```javascript
// 正確的 Beep 格式
ServerSend("AccountBeep", {
    MemberNumber: 目標ID,
    BeepType: "Leash",       // ← 關鍵
    Message: {               // ← 直接物件，不要 JSON.stringify
        BOM: { type, message }
    },
});
```

---

## 七、常見問題

### Bot 顯示上線但遊戲前台看不到
→ 沒有進入聊天室。Bot 必須加入房間才算真正上線，確認 Log 有出現「房間就緒」。

### Bot 登入後馬上斷線（io server disconnect）
→ 可能是版本號問題或 header 設定錯誤。確認 Referer 帶的是正確版本號。

### Beep 送不到 Bot
→ 確認插件端的 `BeepType` 是 `"Leash"`，且 `Message` 是直接物件不是字串。

### Bot 重啟後訊息消失
→ Render 免費方案的檔案系統不持久。建議接入外部資料庫（Upstash Redis 或 Supabase 免費方案）。

### BC 版本升級後 Bot 連不上
→ Bot 會自動從首頁偵測版本號，通常不需要手動修改。若首頁結構改變導致偵測失敗，fallback 會使用 R128。

---

## 八、狀態檢查 Endpoints

| Endpoint | 說明 |
|---------|------|
| `GET /ping` | 回傳 `pong`，供 cron-job 保活使用 |
| `GET /status` | 回傳 Bot 狀態和待投遞訊息數量 |
| `GET /online` | 回傳 `{ online: true/false }`，供插件確認 Bot 是否在線 |

```json
// /status 回傳範例
{
  "botId": 245991,
  "connected": true,
  "pending": [
    { "memberNumber": "212667", "count": 2 }
  ]
}
```
