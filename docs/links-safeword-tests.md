# URL 與安全詞驗收

[文件導覽](README.md) · [保存與資料流向](privacy-and-appearance.md) · [架構導覽（HTML）](https://bondageclub-lite.pages.dev/docs/architecture/)

## 共用 Lite 確認與通知

`src/platform/dialogs.ts` 提供網頁內確認／提示，沿用 Lite 外觀與中、英、俄文翻譯，不使用瀏覽器 alert、confirm 或 prompt。換房、登出、移除好友、清除聊天室／已存歷史、縮短保存期限、降低訊息上限皆須按確認才執行；取消或 Escape 不執行。換房確認開啟期間若帳號／所在房間改變，舊確認失效。媒體來源許可保存失敗與一般操作錯誤也使用 Lite 提示窗。

驗收：換房先取消一次再確認，取消時不得離房；清除紀錄與降低上限先取消，確認資料不變。瀏覽器自己的檔案選取器、下載提示及權限提示不由網站取代。

## 網址

- `src/media/providers.ts` 分類 URL，`chat-links.ts` 管理實際播放器來源許可。支援 HTTPS 圖片／影片／音訊直連及下述 ACV 相容平台；服務播放器使用限定格式的 iframe，不嵌入任意網頁，也不載入 ACV 插件或執行定時 DOM 掃描。
- 測試一般聊天、密語、/me、動作及 BEEP 內的 `https://example.org/`、多個連結、帶參數連結及括號／中文句號。可點擊、另開分頁、原文保持不變。
- `javascript:`、`data:`、含帳密 URL、HTML 標籤不得成為可執行內容。測試 JPG／PNG／GIF／WebP／AVIF、MP4／WebM、MP3／OGG 等直連（含查詢參數）：未許可前没有媒體請求；圖片許可後可載入，影音須再點擊開啟，不自動播放；失效媒體保留原始連結。普通網頁、HTTP 媒體、SVG、非支援服務格式或無法辨識的網址只保留連結，分類細節以 providers.ts 為準。
- 限定平台（例如 YouTube、Vimeo）直接提供播放按鈕；一般媒體直連仍以實際播放器 origin 判斷許可。核對「本次／總是許可」、設定頁撤銷、登出／刷新；來源跳轉仍由瀏覽器處理，來源可能使用 Cookie 或載入其他資源，no-referrer 不等於匿名。
- 同時只保留一個影音播放器，開第二個應釋放第一個；關閉、撤銷許可或訊息移出 DOM 時釋放。一般同房同步不重建未變訊息列，不應重新載入既有播放器。預覽入口阻擋外部媒體，實際播放要在正式入口另測。
- 手機長網址應可折行，不撑寬聊天室；收到連結訊息時草稿與中文輸入不能被重建。

## ACV 相容顯示

設定 → 媒體網域管理中可切換「ACV 影片／音樂網址轉換」，偏好存於 `bc-lite-acv-v1`，預設開啟。只改顯示：訊息、複製連結與匯出保留原網址；支援平台不再詢問網域許可，直接提供觀看／聆聽按鈕，點擊才載入播放器；一般圖片與影音直連仍需許可。設定頁可展開支援網站清單。關閉立即停止影音／iframe，保留普通連結；圖片與既有網域許可不受影響。

支援 YouTube（含 Shorts／Live）、Bilibili 影片／番劇、抖音、Vimeo、Niconico、Facebook 影片、Twitch、Streamable、Dailymotion、Pornhub、Instagram、Spotify、SoundCloud、Apple Music、網易雲與影音直連。GitHub blob／raw 的媒體來源在播放器內轉為 raw.githubusercontent.com，原連結不變。Twitch 使用本站 hostname 作 parent。

不載入 ACV 的掃描計時器或外部 Twitter widget 腳本；X／Twitter 與未識別的短網址保留普通連結。平台可能因地區、登入、內容下架或禁止內嵌而拒絕播放，仍可開原連結；副檔名被辨識不代表瀏覽器支援該編碼。

驗收：從 Lite 發送正常網址，在完整版 BC 應仍為正常連結；開關前後原文字及 href 不變。未許可時無 iframe／影音 src，關閉與撤銷許可後播放器消失，重新開啟只出現播放按鈕。CSP 僅列出支援播放器網域，頁面不執行外部插件腳本。

English: ACV-style players are a local display option. Outgoing text, copied links and exports retain the original URLs. Supported platforms require only a playback click; direct media files still require origin consent. Turning ACV off stops players while keeping links and image permissions. X/Twitter stays a link; third-party playback availability is not guaranteed.

## 安全詞：請先以可恢復的外觀測試

先用完整版 BC／ECHO 備份外觀並確認安全詞設定已啟用，再登入 Lite。測試期間不可同帳號同時登入兩個客戶端。請可信任好友留在房內核對；不要把此初版當作唯一的緊急解除途徑。

1. 點安全詞、選操作：在 Lite 對話框內顯示第二步確認，可返回選擇或取消，不出現瀏覽器 confirm／alert。只有按「確認執行」才送出；失敗原因留在同一個網頁對話框內。
2. 登入後請好友對你使用一般 BC 道具，再選「回復登入外觀」：外觀和姿勢回到登入快照、同步上傳帳戶和房間、仍在房內，互動權限至少為白名單以上（數值 3），原本更嚴格則保留。備份是獨立複本，只存分頁記憶體；換房與自動斷線重連不改變基準，手動重新登入、刷新頁面或切換帳號／環境才建立新備份。
3. 再測「解除並離開」：已知 BC Category=Item 欄位移除，衣物及未知 ECHO 欄位保留，送出原生安全詞動作後離房。有主人的 SlaveCollar 保留，具有 Effect 的型態回復為 noarch=0。稍後重新登入完整版核對實際保存結果。
4. 解除使用最新完整外觀及 `ChatRoomSyncItem` 單件更新，確認新換的衣物不被換回舊款。未知插件欄位可能仍有束縛效果；Lite 不運行完整 InventoryRemoveItems 連動、NPC 支線、Pandora 紀錄或插件腳本，不保證全部解除。
5. 回復只需有效的登入 Appearance 備份，不要求目前房間外觀已同步，也不依賴 AssetFamily 是 Female3DCG；未知插件物件整包保留，沒有 AssetFamily 時不猜測、不上傳該欄。真的沒有登入備份時才提示重新登入，絕不以空陣列代替缺少的資料。解除則需要目前有效外觀，未知角色類型仍不能套用 BC 道具分類。帳號未明確啟用安全詞、GGTS 房間、離線的限制保持不變。
6. `/safeword` 會提示使用確認按鈕，不作為普通聊天發送。重複快速點擊會被限制。確認對話框開啟後若斷線或離房，協定層仍會再次檢查。

## 同步與限制

- 安全詞確認後寫 `AccountUpdate`（Appearance／AssetFamily，以及回復時的權限）、`ChatRoomCharacterUpdate`（自己的 ID／Appearance／ActivePose）及原生安全詞 Action。OnlineSharedSettings 不改動。這裡描述安全詞路徑；[貼貼](echo-cuddle-tests.md)也會提交房間外觀，但不送 AccountUpdate。
- 送出並非伺服器保存成功回執；沒有把本機改變稱為已驗證成功。請以重登入和同房玩家觀察驗收。此次自動測試使用模擬 socket，未動用真實帳號。
- 原生流程參考本機 BC `ChatRoomSafewordRevert`、`ChatRoomSafewordRelease`、`CharacterReleaseTotal`、`ServerPlayerAppearanceSync`。已知 Item 分類取自 Female3DCG 資產表；新增分類時須同步 `src/safety/safeword.ts`。不引入完整 BC 執行程式或圖片。
- 不使用 LCE 的「保留互動權限」hook：安全詞回復採 BC 預設收緊權限，避免靜默取消保護。

執行 `npm run build`、`npm test`；部署設定不變，仍需提交／推送後等待 Cloudflare 建置。
