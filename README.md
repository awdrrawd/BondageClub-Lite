# BondageClub-Lite

一個只載入登入、聊天室搜尋與純文字聊天室的 Bondage Club 非官方輕量入口。它是純靜態前端，部署後由玩家的瀏覽器直接連線 BC；不需要自架 API、WebSocket 中繼或常駐伺服器。

## 目前功能

- BC 帳號登入與自動重連
- 公開／私人空間、語言、滿房、鎖房與描述搜尋
- 加入／離開聊天室及房內成員列表
- 接收 Chat、Whisper、Emote、Action、Activity 與系統訊息
- 傳送一般聊天、`/me 動作`、`*動作*`、`/w 會員編號 密語`
- 響應式手機版 `chat-room-div` 結構

這是文字客戶端，刻意不載入角色外觀、服裝、活動資產與完整翻譯字典。因此 Action／Activity 可能顯示 BC 的原始訊息鍵；也不提供換裝、互動、遊戲、好友 Beep 或管理房間等功能。

## 安全模型

- 密碼只保留在目前分頁的 JavaScript 記憶體，不寫入 localStorage、cookie、IndexedDB 或網址。
- 所有伺服器文字均以 `textContent` 建立，不執行聊天室傳入的 HTML。
- Cloudflare Pages 的 `_headers` 會限制腳本與連線來源。
- 本站仍然是可接觸 BC 帳密的第三方前端；請自行部署、檢查程式碼並只使用你信任的網址。
- BC 同一帳號只有一個連線；從 Lite 登入會讓其他 BC 分頁斷線。

## 本機開發

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev
```

正式建置與檢查：

```bash
npm run build
```

輸出位於 `dist/`，可以放到任何 HTTPS 靜態網站。Socket.IO 固定使用已修補安全問題的 `4.8.3`，並強制 `websocket` transport；不要改回預設的 polling，否則跨來源請求會被 BC 伺服器的 CORS 設定擋下。BC Bot 指南使用的 4.6.2 與此版同屬 Socket.IO 4 協定。

## 免費部署：Cloudflare Pages

1. 把此專案 push 到 GitHub。
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git。
3. 選擇 `awdrrawd/BondageClub-Lite`。
4. Build command 填 `npm run build`，Build output directory 填 `dist`。
5. 不要新增 Functions，也不需要設定任何帳密環境變數。
6. 部署後先用測試帳號登入，確認搜尋與進房。

`public/_headers` 會隨建置複製到 `dist/_headers`。若使用 GitHub Pages，網站仍可運作，但 `_headers` 不會生效；基於帳密入口的安全考量，建議優先用 Cloudflare Pages。

## 協定依據

- `BC-Bot-Deploy-Guide.md`：WebSocket-only、登入時序及事件踩坑
- Bondage Club R131 `Scripts/Messages.d.ts`、`Scripts/Server.js`、`ChatSearch.js`、`ChatRoom.js`
- `BC-LCE`：行動版聊天室版面及斷線重連行為參考

事件流程與模組界線另見 [`docs/architecture.md`](docs/architecture.md)。

## 已知限制

- 尚未以真實 BC 帳密做端到端測試；登入測試需由帳號持有人手動完成。
- Lite 不載入 BC 的限制／語音轉換引擎，因此傳送文字不會模擬口塞亂碼、禁語與部分角色限制。請把目前版本視為技術預覽，不要用它規避房間規則或角色限制。
- BC 若更換伺服器網址或 Socket.IO 協定，需要同步更新 `src/protocol.ts` 與 CSP。

## 授權

本專案程式碼依 [MIT License](LICENSE) 發布。`socket.io-client` 為 MIT 授權。Bondage Club 名稱及伺服器協定屬其各自權利人；本專案不包含遊戲素材。
