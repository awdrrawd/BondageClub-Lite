# 客戶端架構

[文件導覽](README.md) · [HTML 摘要](architecture.html) · [翻譯貢獻](../src/translations/README.md)

本頁是模組責任與資料流的維護基準；HTML 提供可獨立部署的摘要。最後對照原始碼：2026-09-11。

## 系統邊界

```text
Cloudflare Pages 靜態資源 → 瀏覽器 LiteApp
                                 │
                  /api/relay-status（登入前檢查）
                  /socket.io/（Socket.IO，WebSocket-only）
                                 │
                        Pages Worker
                  固定 BC 上游／指定 Origin
                                 │
                          Bondage Club
```

`public/_worker.js` 只代理指定的握手路徑，使用新標頭而不轉送網站 Cookie／Authorization；回傳上游 101，由 Cloudflare 橋接後續封包。帳密與所有遊戲流量都經中繼。Worker 不新增封包日誌、歷史資料庫或帳號保存 API；**瀏覽器另有本機 IndexedDB**，兩者不能混為一談。

`/api/relay-status` 只證明中繼設定可讀；登入仍檢查 `LoginResponse.Environment === "PROD"`。ServerInfo 人數不作環境認證。瀏覽器不自行設定 WebSocket Origin、不退回直連 DEV。路由、CSP 與部署方式見[部署與驗收](deployment-and-tests.md)。

## 模組責任

| 位置 | 責任 |
| --- | --- |
| src/main.ts | 啟動 UI |
| src/network/client.ts | 唯一 Socket.IO 擁有者；登入、重連、快照、搜尋、房間、好友、送出驗證、外觀寫入例外 |
| src/network/speech.ts | 讀取發送者提供的 Dictionary.Original；沒有原文就保留收到的文字，不破解語音混淆 |
| src/shared/types.ts | Lite 使用的協定資料子集 |
| src/ui/app.ts | 訂閱快照、導覽、局部 DOM 更新、草稿、歷史分頁及帳戶切換 |
| src/ui/room-list.ts、private-messages.ts | 房間排序／可加入狀態；私訊合併與排序快取 |
| src/ui/activity-dialog.ts、history-settings.ts | 活動選單與送出前條件刷新；保存設定與按日匯出 |
| src/ui/dom.ts、contact-card.ts、icons.ts、icon-select.ts、style.css | 安全 DOM 元件、卡片、本機 SVG、選單及響應式版面 |
| src/storage/history.ts | 白名單資料、IndexedDB v2、雙向索引分頁、到期清理及 TXT 匯出 |
| src/storage/history-session.ts | 增量收集、批次寫入、失敗重試、有上限的私訊快取、跨帳戶／請求競態隔離 |
| src/action/ | catalog／merge 文字表；render／embedded 句子處理；native／extensions／labels 活動條件與標籤；cuddle 貼貼 |
| src/translations/、src/i18n/ | 可編輯翻譯來源；UI 語言、參數及狀態重譯 |
| src/profile/ | BIO 解壓、好友名稱與 AFC 共享關係 |
| src/media/ | URL 分類、實際播放器來源許可、按需建立／釋放 |
| src/safety/ | 安全詞分類與 AEE／SCA 裝飾資料保護 |
| src/platform/ | 手機手勢、生命週期、常亮／本機音訊、Lite 確認對話框 |
| src/preview/ | 注入虛構 UiClient，重用正式 UI；不登入 BC、不開歷史 IndexedDB |
| public/、scripts/、tests/ | Worker／標頭／公開授權；靜態資料擷取與編譯；模擬協定、DOM、儲存與建置檢查 |

## 登入、搜尋與恢復

```text
idle → connecting → authenticating → waiting-server → ready
                                                        │
                                                     joining → in-room
                                                        ↑         │
                                                        └─ ready ←┘ 離房

暫時斷線 → reconnecting → 重新認證／ServerInfo → 嘗試回房一次
手動登出 → idle；登入失敗／強制下線 → error（不搶回帳號）
```

LoginResponse 與 ServerInfo 都到達才開放一般操作。自動重連使用分頁記憶體中的帳密。回房優先序為斷線前房名 → 本機帳戶／環境房名 → BC LastChatRoom；明確離房等操作寫入 null，抑制舊房名回退。

搜尋序列化，快速切換只保留最後待查條件。BC 搜尋回覆沒有請求 ID；逾時後有新查詢意圖時重新連線認證，隔離舊回覆。前景探測以 OnlineFriends 查詢啟動，任何正常的已認證伺服器事件都可證明回應；逾時才重啟傳輸。不補傳聊天、不宣稱送達或已讀。

安全詞基準在首次登入／身分改變時建立；同一帳戶自動重連保留既有基準，手動登出後再登入建立新的基準。詳細流程見[手機與連線](mobile-connection-tests.md)。

## 快照與 DOM 更新

```text
BC 事件 → client.patch → 新 ClientSnapshot
                           ├→ HistorySession.observe → 待寫批次 → IndexedDB
                           └→ LiteApp → 判斷結構／資料改變 → 必要 DOM 修改
```

- 同帳戶、連線階段與房名不變：更新標頭、訊息、房間資訊、成員、好友或搜尋結果，不重建 shell。
- 成員按會員編號更新；未變的好友／房間卡片保留節點。點擊成員或自身資料時讀取最新快照，避免舊事件閉包顯示過期外觀。
- 訊息按 ID 維護順序，修正只替換受影響的列。沒有訊息陣列改變時跳過聊天列表處理。
- 成員抽屜、公開聊天翻頁、回覆／取消及引用跳轉使用局部更新。閱讀舊頁時保留切片，新訊息不強制捲到底。
- 首次掛載、帳戶／連線階段／房間切換，以及主動切頁、對話、語言或部分顯示設定仍可能重建。組字期間延後結構更新。
- 每分鐘呼叫歷史維護觀察；到期清理約每小時檢查，不是定時重新建立 UI。

房間 live ring 可選 600／1500／3000 則，DOM 每批 50／100／200 則（預設 100）。私訊 DOM 每頁 60 則。節點移除前釋放媒體；未修改的節點與播放器維持掛載。驗收见[房間與聊天](chat-layout-tests.md)。

## 本機歷史與記憶體

訊息物件以不可變方式更新：修改時建立新物件。HistorySession 用弱參照集合跳過已處理的物件，只對新增／修正版本建立白名單資料並序列化；陣列身分檢查仍有成本，並非所有流程都為常數時間。

寫入延遲 350ms 合併，按 ID 去重；失敗批次保留並最多自動重試三次。帳戶 generation、房間／清除 generation、私訊請求序號防止舊結果覆蓋新狀態；清除與寫入序列化，避免舊批次復活。

IndexedDB `bc-lite-history` v2 的 messages／contacts 按環境及玩家 ID 分區。訊息預設 7 天、最近聯絡人 30 天，可縮短或關閉。歷史不保存原始 Dictionary、BIO、外觀或帳密。

啟動讀取各最多 3000 筆房間／私訊。私訊快取合計最多 3000 筆；開啟對象最多 600 筆，其他對象共最多 2400 筆。雙向每批 60 筆以時間與唯一鍵分頁；淘汰只影響記憶體，不刪磁碟。閱讀舊視窗時新私訊繼續保存，向後翻頁可回到最新。匯出直接讀取選定日期的未過期磁碟紀錄，不受快取上限限制。詳見[本機紀錄](local-history-and-contacts.md)。

## 文字與活動管線

1. client 過濾控制訊息；Chat／Whisper 可附加發送者分享的 Original，普通聊天不套用動作翻譯。
2. action/embedded 處理可讀插件替代文字；action/render 以文字表和 Dictionary 代入玩家、物品、部位。
3. UI 使用 textContent／安全連結 API；BIO 按需解壓，玩家原文及 CraftName 不自動翻譯。
4. 登入後 catalog.ts 載入英文基底及所選語言差異；compile-action-catalogs 從 src/translations/ 建立 src/action/generated/。UI 字典獨立於動作表，overrides 最後套用。
5. 原生活動送 Activity；一般擴展項目送文字 Action。已知工具、對方偏好及房間限制在送出時再檢查；Lite actor policy 與相容模式不等於完整 BC 引擎。

沒有角色繪圖、衣櫃、完整遊戲／活動效果引擎。貼貼與安全詞是經確認的外觀寫入例外，不可概括為「完全唯讀」。詳見[活動與社群協定](chat-native-identity-tests.md)、[貼貼](echo-cuddle-tests.md)、[隱私與外觀](privacy-and-appearance.md)。

## 主要協定

| 方向 | 事件 | 用途 |
| --- | --- | --- |
| 送出 | AccountLogin | 登入 |
| 收到 | LoginQueue、LoginResponse、ServerInfo | 登入與就緒 |
| 送出／收到 | AccountQuery／AccountQueryResult | OnlineFriends |
| 送出／收到 | AccountBeep | 普通文字、AFC 查詢回覆、經允許的召喚 |
| 送出 | ChatRoomSearch、ChatRoomJoin、ChatRoomCreate、ChatRoomLeave | 房間操作 |
| 收到 | ChatRoomSearchResult、ChatRoomSearchResponse、ChatRoomCreateResponse、ChatRoomSync* | 房間結果、角色／物品同步 |
| 送出／收到 | ChatRoomChat／ChatRoomMessage | Chat、Whisper、Emote、Action、Activity、受控 Hidden |
| 送出 | AccountUpdate | 好友列表；確認安全詞時的外觀／權限例外 |
| 送出 | ChatRoomCharacterItemUpdate、ChatRoomCharacterUpdate | 確認貼貼／安全詞的房間外觀同步 |
| 收到 | ForceDisconnect、disconnect、connect_error | 停止或恢復連線 |

事件名稱與有效條件以 src/network/client.ts 及 tests/protocol.test.mjs 為準；封包送出不等於伺服器保存成功。

## 開發與驗證

```sh
npm ci
npm run build
npm test
npm run dev:ui
```

build／dev 的前置步驟重建文字產物；開發伺服器運行期間修改翻譯後需另跑 `npm run catalog:compile`。只有更新上游擷取資料才需本機 BC／插件來源目錄。不要手改 generated/。

`scripts/legacy/extract-ui-i18n.mjs` 是已完成的一次性遷移工具，不應重新執行來覆寫現行翻譯。

UI 預覽禁止外部媒體，且不包含在正式建置。happy-dom、fake-indexeddb 與模擬 socket 驗證邏輯、節點身分與競態，不能取代真實版面、手機鍵盤、Cloudflare PROD 或雙人插件測試。第三方來源與授權依[文件導覽](README.md)查閱。
