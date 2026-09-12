# 帳號、資料流向與外觀保護

[文件導覽](README.md) · [本機紀錄](local-history-and-contacts.md) · [架構導覽（HTML）](https://github.com/awdrrawd/BondageClub-Lite/blob/Mater/docs/architecture/index.html)

## 資料保存位置

| 資料 | 位置與行為 |
| --- | --- |
| 密碼／短期登入狀態 | 分頁記憶體；供自動重連，不寫 localStorage、IndexedDB、Cookie 或網址；登出／重新整理後不再由 Lite 保留 |
| 記住帳號 | 自願啟用；bc-lite-account-v1 明文帳號名稱，登出仍保留；取消或設定頁可刪除 |
| 顯示／語言與數量偏好 | bc-lite-display-v1、bc-lite-performance-v1 |
| 保存期限 | bc-lite-history-policy-v1 |
| 最近房名 | `bc-lite-last-room-v1:<編碼環境>:<玩家ID>`；明文房名或 null，見[回房規則](mobile-connection-tests.md#登入回房) |
| 永久媒體許可 | bc-lite-media-origins-v1；只保存許可 origin，本次許可只在記憶體 |
| 聊天／私訊／最近聯絡人 | 瀏覽器 IndexedDB bc-lite-history；訊息預設 7 天、聯絡人 30 天，可縮短或關閉 |
| 外觀、安全詞基準、AFC 房名、召喚允許名單、草稿、诊斷 | 分頁記憶體；不寫歷史資料庫 |
| 本機音訊 | 本機 File／Blob URL；不由 Lite 上傳，登出釋放 |

「記住帳號」只控制帳號名稱，並不控制歷史保存。帳戶分區避免 UI 混用，並非加密或存取隔離；同源程式、可操作此瀏覽器的人與具權限擴充功能可能讀取明文資料。匯出的 TXT／HTML／Excel 檔案不受網站到期清理管理。

Lite 的帳號保存與瀏覽器密碼管理器互相獨立；清除 Lite 保存的帳號不會刪除瀏覽器另存的密碼。

## 網路資料流

瀏覽器 → HTTPS/WSS → Cloudflare Pages Worker → HTTPS/WSS → BC。帳密與遊戲流量都經過中繼；這不是瀏覽器到 BC 的端對端加密。前端本身也必須讀取帳密才能登入。

Worker 只轉送固定 BC WebSocket，不新增封包日誌、資料庫或保存 API；前端另有上述本機歷史。程式沒有第三方分析追蹤、遠端翻譯或歷史同步服務。不能由程式碼保證部署者、Cloudflare 平台、BC 或瀏覽器擴充功能的保存政策。排錯請提供狀態文字與部署版本，不公開未清理的 HAR、完整 LoginResponse、帳密或私人對話。

## 外觀資料與寫入例外

登入及房間同步保留 Appearance／OnlineSharedSettings 的未知欄位，不因缺少本機資產註冊而過濾物品；不載入 ECHO、AEE、SCA 繪圖或私人備份。單件更新只替換指定 Group，保留其他 Property、Craft、顏色及插件資料。不因其他玩家合法換裝而自動回復登入外觀。

一般聊天、好友操作不寫回外觀；好友更新只送 FriendList。例外為：

- **安全詞**：確認後更新帳戶／房間外觀；回復另依 BC 規則收緊互動權限。基準保留本次登入快照，見[安全詞驗收](links-safeword-tests.md)。
- **ECHO 貼貼**：確認後只改自己的 ItemMisc，送單件通知及完整房間外觀提交；其他欄位保留，不送 AccountUpdate、不替對方操作。解除不刪除已被換成其他物品的格子，見[貼貼驗收](echo-cuddle-tests.md)。

AEE 的 SingleGloveFX／ItemCanvas／Mask／Vis 伴隨層、Property.CustomDraw 等，以及 SCA「自定义贴图」的 Textures／姿勢資料均以原始 bundle 保留。安全詞解除保留不帶已知 Effect／Block 的 SCA 裝飾；有已知效果的原生 Item 格子仍依規則解除。未知插件束縛無法保證全部解除；原本缺失的素材資料不從舊快照自動補回。

保留資料不等於提供插件渲染器。觀看端須裝相應插件，實際外觀與保存結果要由另一帳號及重新登入核對。

## 媒體與自報識別

媒體網域管理以框列出永久許可及本次許可；永久列表不重複標示「總是許可」，兩類均可撤銷。撤銷按鈕使用 #ff8b8b，文字與色彩共同辨識操作。

HTTP(S) 連結不解析玩家 HTML。HTTPS 圖片／影音直連，以及部分 YouTube、Vimeo、Spotify 網址可按來源許可嵌入。許可依**實際播放器 origin**，不是僅看原始連結；影音須另外點擊開啟，不自動播放，同時僅保留一個播放器。允許的是特定服務 iframe，不是任意網頁。

媒體直接連來源，來源可收到 IP、使用 Cookie 或載入次級資源；網站設定 no-referrer，不代表匿名代理。重新導向由瀏覽器處理。撤銷許可釋放媒體，不能撤回已送出的請求。詳細格式與測試見[媒體與安全詞](links-safeword-tests.md)。

Lite 以 Hidden/BCLiteHello 自報 client: Lite，沒有版本、帳密或插件清單；支援的觀看端能識別 Lite。window.BCLite 只提供靜態名稱，不暴露連線操作。這是自報標記，不是身分驗證。原生活動接收端可能產生活動效果；Lite 自身不執行完整 BC 效果引擎。

## 訊息音效

BEEP 與悄悄話通知音效各自開關，預設關閉，偏好以 bc-lite-sounds-v1 存 localStorage。音效由 Web Audio 本機產生，不下載聲音、不請求桌面通知權限。啟用時播放短音預覽；瀏覽器需使用者手勢解鎖，背景／鎖屏播放仍受瀏覽器限制。未讀計數只在分頁記憶體，不上傳已讀狀態。

## 驗收

1. 勾選／取消記住帳號、登出、重新整理，核對僅相應帳號 key 改變；密碼不由 Lite 保存。
2. 檢查上述 localStorage keys 與 IndexedDB：歷史僅含白名單訊息，不得有密碼、完整帳號、BIO、Appearance 或 Dictionary。
3. 切換帳戶／環境、清除歷史、縮短期限，按[本機紀錄](local-history-and-contacts.md)驗證。
4. ECHO／AEE／SCA 觀看端比對登入 Lite、聊天、加好友、一般單件同步前後；未知裝飾欄位不應丟失。
5. 以可恢復的測試外觀分別驗證安全詞與貼貼；普通操作不送外觀更新，確認例外才送；重新登入完整版核對結果。
6. 未許可媒體前 Network 無來源請求；許可、撤銷、登出及訊息移出 DOM 時核對播放器生命週期。
