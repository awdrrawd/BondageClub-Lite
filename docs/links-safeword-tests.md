# URL 與安全詞驗收

## 網址

- 參考 LCE `src/features/chat/chat-augments.js` 的文字節點連結化與 HTTP(S) 限制；Lite 支援 HTTPS 圖片／影片直連在訊息內顯示，不使用網域信任名單或任意网页 iframe。
- 測試一般聊天、密語、/me、動作及 BEEP 內的 `https://example.org/`、多個連結、帶參數連結及括號／中文句號。可點擊、另開分頁、原文保持不變。
- `javascript:`、`data:`、含帳密 URL、HTML 標籤不得成為可執行內容。測試 JPG／PNG／GIF／WebP／AVIF 與 MP4／WebM 直連（含查詢參數）：圖片內嵌、影片有播放控制且不自動播放；故意失效網址应移除媒體並保留連結。来源站會收到媒體請求，並非只在點擊後才連線。普通网页、HTTP 媒體、SVG 及不帶可辨識副檔名的網址只保留連結。
- 手機長網址應可折行，不撑寬聊天室；收到連結訊息時草稿與中文輸入不能被重建。

## 安全詞：請先以可恢復的外觀測試

先用完整版 BC／ECHO 備份外觀並確認安全詞設定已啟用，再登入 Lite。測試期間不可同帳號同時登入兩個客戶端。請可信任好友留在房內核對；不要把此初版當作唯一的緊急解除途徑。

1. 點安全詞、選操作但取消確認：不得送出外觀或安全詞封包。
2. 登入後請好友對你使用一般 BC 道具，再選「回復登入外觀」：外觀和姿勢回到本次登入快照、仍在房內，互動權限至少為白名單以上（數值 3），原本更嚴格則保留。這不是逐次進房快照；重連重新登入會建立新基準。
3. 再測「解除並離開」：已知 BC Category=Item 欄位移除，衣物及未知 ECHO 欄位保留，送出原生安全詞動作後離房。有主人的 SlaveCollar 保留，具有 Effect 的型態回復為 noarch=0。稍後重新登入完整版核對實際保存結果。
4. 解除使用最新完整外觀及 `ChatRoomSyncItem` 單件更新，確認新換的衣物不被換回舊款。未知插件欄位可能仍有束縛效果；Lite 不運行完整 InventoryRemoveItems 連動、NPC 支線、Pandora 紀錄或插件腳本，不保證全部解除。
5. 帳號未明確啟用安全詞、GGTS 房間、不支援的 AssetFamily、缺少／損壞的完整外觀、離線時應拒絕，不得只發出「已解除」訊息。遇到拒絕請使用完整版 BC，不自行篡改封包或設定繞過。
6. `/safeword` 會提示使用確認按鈕，不作為普通聊天發送。重複快速點擊會被限制。確認對話框開啟後若斷線或離房，協定層仍會再次檢查。

## 同步與限制

- 只有確認安全詞才寫 `AccountUpdate`（Appearance／AssetFamily，以及回復時的權限）、`ChatRoomCharacterUpdate`（自己的 ID／Appearance／ActivePose）及原生安全詞 Action。OnlineSharedSettings 不改動。
- 送出並非伺服器保存成功回執；沒有把本機改變稱為已驗證成功。請以重登入和同房玩家觀察驗收。此次自動測試使用模擬 socket，未動用真實帳號。
- 原生流程參考本機 BC `ChatRoomSafewordRevert`、`ChatRoomSafewordRelease`、`CharacterReleaseTotal`、`ServerPlayerAppearanceSync`。已知 Item 分類取自 Female3DCG 資產表；新增分類時須同步 `src/safeword.ts`。不引入完整 BC 執行程式或圖片。
- 不使用 LCE 的「保留互動權限」hook：安全詞回復採 BC 預設收緊權限，避免靜默取消保護。

執行 `npm run build`、`npm test`；部署設定不變，仍需提交／推送後等待 Cloudflare 建置。
