# 客戶端架構

[文件導覽](README.md) · [架構導覽（HTML）](https://bondageclub-lite.pages.dev/docs/architecture/) · [翻譯貢獻](../src/translations/README.md)

本頁是模組責任與資料流的維護基準；HTML 提供可獨立部署的摘要。

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
| src/main.ts | 正式入口：建立 LiteApp、注入 bcClient 並掛載 BCLite API |
| src/network/client.ts | 唯一 Socket.IO 擁有者；登入、重連、快照、搜尋、房間、好友、送出驗證、外觀寫入例外 |
| src/network/speech.ts | 讀取發送者提供的 Dictionary.Original；沒有原文就保留收到的文字，不破解語音混淆 |
| src/shared/types.ts | Lite 使用的協定資料子集 |
| src/ui/client-contract.ts、src/extensions/types.ts | UI／預覽及插件橋接的型別契約；僅型別引用 client，不載入網路實作 |
| src/ui/app.ts | 訂閱快照、導覽、局部 DOM 更新、草稿、歷史分頁及帳戶切換 |
| src/ui/room-list.ts、private-messages.ts | 房間排序／可加入狀態；私訊合併與排序快取 |
| src/ui/history-search.ts | 本機歷史搜尋，每頁 50 筆；同房間／同對話上下文，帳戶與請求序號隔離 |
| src/platform/message-sounds.ts | BEEP／悄悄話獨立開關；Web Audio 本機短音，使用者手勢解鎖與 700ms 合併 |
| src/ui/activity-dialog.ts、history-settings.ts | 活動選單與送出前條件刷新；保存設定與按日匯出 |
| src/ui/dom.ts、contact-card.ts、icons.ts、icon-select.ts、style.css | 安全 DOM 元件、卡片、本機 SVG、選單及響應式版面；國旗採本站雜湊 SVG URL，其他圖示保留內嵌 SVG |
| src/storage/history.ts | 白名單資料、IndexedDB v2、雙向索引分頁、到期清理及 TXT 匯出 |
| src/storage/history-export.ts | 獨立 HTML 閱讀頁與固定 OOXML／ZIP 結構的 XLSX 產生器；所有儲存格明確為文字 |
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

介面與動作目錄支援 zh／en／ru。俄文 UI 隨前端載入，BC 俄文差異表按語言選擇載入；插件缺漏回退英文。build-text-catalog.mjs 從 RU 資源取文，拒絕遺失角色／物品替換標記的譯文。

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
| 送出／收到 | AccountBeep | 普通文字、AFC 查詢回覆、經允許的召喚及 Leash 跟隨 |
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

已完成的一次性 UI 翻譯遷移腳本已移除；需要查閱時使用 Git 歷史。

UI 預覽禁止外部媒體，且不包含在正式建置。happy-dom、fake-indexeddb 與模擬 socket 驗證邏輯、節點身分與競態，不能取代真實版面、手機鍵盤、Cloudflare PROD 或雙人插件測試。第三方來源與授權依[文件導覽](README.md)查閱。

## 未讀、搜尋與斷線閱讀

未讀依玩家編號在分頁記憶體累計，只計新收到的 BEEP／Whisper；自身送出、重複 ID 與歷史還原不計入。正在前景對話底部閱讀且沒有既存未讀時不增加。切換對象不自動清除，可定位第一則未讀或手動標記已讀；超出快取時改查本機上下文。這不是伺服器已讀回條，重新載入不保留計數。

搜尋由 HistorySession 等待寫入後交給 HistoryStore 的 ownerKindTime 索引游標，結果每頁最多 50 筆，以時間與唯一鍵排序；不把整個資料庫載入 UI。上下文前 10／後 10 筆限制於同房間或同私訊對象。搜尋與上下文只顯示文字，不載入媒體、不改變房間與草稿。

暫時斷線由 UI 保留 recoveryRoom 作閱讀用途；真實連線快照仍決定發送權限。同帳戶回到同名房間保留 DOM，登出、帳戶變更或換房重新建立對應畫面。草稿不自動重送。BEEP／悄悄話音效偏好存 bc-lite-sounds-v1，預設皆關閉；不請求桌面通知權限。

## 插件 API

src/extensions/api.ts 建立 BCLite v1，同步事件由 client.subscribeMessages 提供，與畫面／歷史快照訂閱分離。插件只能透過現有 client 方法送出，原生活動使用嚴格條件及共用線上玩家權限檢查。沒有暴露帳密、Socket、外觀寫入及房主／地圖功能。完整介面見[插件 API](plugin-api.md)。

## 架構檢視與後續整理

目前靜態執行期 import 圖無循環。ui/app.ts 只匯出類別，建構時注入 UiClient（定義於 ui/client-contract.ts）與掛載節點；正式入口與 preview/main.ts 各自建立實例。離線預覽的執行期依賴不包含 network/client.ts。TypeScript 已啟用未使用局部變數／參數檢查，但它不涵蓋所有未使用 export、動態翻譯鍵或外部插件 API。

已清除無引用的 defaultHistoryPolicy、測試專用 activityInventoryReason 包裝及已完成的 UI 遷移工具。build-extension-rules.mjs 仍有人工更新用途，動態載入的翻譯、插件相容分支與 BCLite 公開入口保留。

本輪整理：

- `ui/settings-view.ts` 負責設定頁組裝，透過窄介面接收設定與操作；`ui/unread-state.ts` 集中訊息去重、各對象未讀數與已讀標記，UI 只提供目前是否正在閱讀。
- `network/room-search.ts` 管理搜尋排隊、逾時及重連重試。`network/client.ts` 仍是唯一 Socket 擁有者，搜尋模組只透過注入的操作發送請求。
- `platform/lifetime.ts` 統一取消 UI 訂閱、全域事件與計時器。`LiteApp.dispose()` 清理媒體、音效、常亮、對話框並等待歷史批次寫入；不等同登出，不主動切斷共用 client。`BCLite.dispose()` 可另行撤銷所有插件及橋接訂閱。
- `tests/load-typescript.mjs` 用語法樹移除模組宣告，保留字串內容；測試仍明確注入依賴，Vite 專用的 chunks 也以宣告名稱替換，不再全面取代 export 字串。
- `action/interaction-permission.ts` 集中官方線上玩家 0–5 級互動規則：主人、戀人、白名單、黑名單與支配聲望。UI 與插件每次送出均使用最新快照檢查；缺資料不推定允許，相容模式不繞過。貼貼維持獨立的雙方確認與只改自身欄位流程。
- 搜尋模組以 reset／complete／takeRecovery 管理狀態轉移，client 不直接修改搜尋排隊或重連欄位。

這次調整模組責任與清理入口，已補齊線上互動關係規則；未新增物品操作。貼貼協定協調、帳戶與房間畫面仍由 client／LiteApp 統籌；沒有為了縮短檔案而把同一狀態任意分散到多個 Socket 或視圖控制器。

English: Settings composition, unread accounting, room-search retries and UI resource cleanup now have dedicated modules. UI and plugins share online permission levels 0–5, including ownership, lovers, lists and dominance, with missing-data rejection. Tests remove module declarations structurally while preserving source strings. The client remains the sole socket owner; disposal of a UI does not disconnect it. NPC and inventory operations remain outside this refactor.

## 牽引與招喚

`action/leash.ts` 只讀檢查牽引裝備、效果、鎖具與共用關係權限；`network/leash-session.ts` 保存已驗證牽引者，處理放開、ping 及短暫離房窗口。client 使用既有 RoomSearch 查詢目標，返回後再驗證權限及容量，才送出離房／加入。控制封包不進訊息事件或歷史，不寫外觀。BCX 相容招喚使用獨立的本機允許名單與人工接受。設定、限制與雙人驗收見[活動與社群協定](chat-native-identity-tests.md)。
