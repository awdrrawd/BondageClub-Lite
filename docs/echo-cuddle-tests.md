# ECHO 貼貼與配對驗收

[文件導覽](README.md) · [活動條件](chat-native-identity-tests.md) · [外觀保存界線](privacy-and-appearance.md) · [架構導覽（HTML）](https://github.com/awdrrawd/BondageClub-Lite/blob/Mater/docs/architecture/index.html)

## 實作範圍

`src/action/cuddle.ts` 集中貼貼前置條件、最小內建物件定義（ItemMisc/贴贴）、物件建立函式與雙向配對資料。Lite 不使用完整版的 AssetGet／AssetAdd，不依賴別人先穿戴或安裝插件才建立 bundle。

確認後，網路層只改動自己的 ItemMisc，先送原生 ChatRoomCharacterItemUpdate，再依 ECHO 做法送 ChatRoomCharacterUpdate 提交完整的房間角色 Appearance；其餘欄位原樣複製，保留未知插件資料和當前姿勢，不送 AccountUpdate。解除同樣提交房間外觀，避免下一次房間同步復原成舊資料。player.Appearance、房間角色列表與安全外觀快照同步更新。單件通知不能取代房間外觀提交，這是舊版兩個 Lite 互動後下一次房間同步可能失去物件的缺口。

Hidden/Luzi_XCharacterDrawState 分享位置狀態，不在 Lite 載入 ECHO 或人物圖片。貼貼不受一般動作的姿勢、工具或興奮設定篩選，但要求有效同房角色資料、非自己，以及明確確認。確認前列出雙方 ItemMisc；自己的既有道具可在確認後替換，絕不替對方操作。以格子和配對快照再次驗證同意，狀態改變時要求重新確認。

協定參考 ECHO 貼貼活動與 [bc-modding-utilities 的 wearAndPair](https://github.com/SugarChain-Studio/bc-modding-utilities/blob/main/src/ChatRoomOrder/tools.js)、[狀態同步](https://github.com/SugarChain-Studio/bc-modding-utilities/blob/main/src/ChatRoomOrder/sync.js)。這不是完整 ECHO 引擎：不提供跨房牽引，不保證帳號持久保存或接收端執行成功。完整版觀看端需要 ECHO 才能呈現插件道具／位置。

## 雙人實測（尚需真人帳號驗證）

1. 兩位同房、ItemMisc 空白的 Lite 玩家，分別測試「鑽進懷裡」「抱入懷中」。發起前應要求確認；接收方拒絕時不得穿戴。接受後雙方各更新自己的貼貼道具並提交自己的房間外觀，方向互為對應。找第三位玩家稍後進房，確認對方收到的 Appearance 中雙方均有 ItemMisc/贴贴；已有房間角色同步後也不能消失。
2. 換成 Lite 與 ECHO 玩家，在允許互動的設定下測試兩個方向。觀看端核對位置及道具；不應把「封包已送出」當作成功回執。
3. 任一方 ItemMisc 已有其他物品仍能邀請，但需先顯示雙方格子；貼貼顯示已分享的對象 ID，未收到資料時明示未知，不猜測 ID。取消／逾時邀請不能穿戴；目標離房後不能接受。測試確認期間替換任一方 ItemMisc，舊確認必須失效。接收方拒絕不會改寫接收方物品；發起方已確認穿戴的物品需自行解除。
4. 點「解除貼貼」、讓對方離房、或移除貼貼，核對配對清除。若該欄被換成其他道具，解除不得刪除替代道具；衣服、Property 等其他欄位保持原樣。
5. 刷新／斷線重連後核對外觀；配對僅保存在本次分頁記憶體，不承諾刷新後恢復位置關係。

`tests/protocol.test.mjs` 包含不載入 ECHO 的雙 Lite 封包模擬：雙方接受、兩種方向、完整房間外觀提交、後續同步／新觀看者、解除及保留其他插件物件。這不是正式 BC 伺服器回執測試，仍需以上雙帳號驗收。

## 翻譯與介面

1. 中、英、俄文各檢查原生、小酥、LSCG、ECHO 的選單標籤及動作句子。未提供翻譯仍保留來源文字，不應顯示 MISSING TEXT；動態插件自訂句子不保證全部涵蓋。
2. 目標沒有 Pussy/Penis 時不出現 ItemPenis／ItemGlans 專用動作；有時合併到外陰／陰部對應熱區，不另加人物格子。
3. 導航順序為搜尋、房間、私聊、好友、設定。進出訊息文字置中，時間及 ID 靠右。
4. 私聊選同一人，交替發送私訊與悄悄話：同一時間線、對方靠左自己靠右，有通道標籤。通道選單在輸入左側、送出在右側，加好友在標題最右；沒有編號輸入框、移除按鈕或 muted 樣式。
5. 手機檢查清單／聊天切換、長訊息換行與鍵盤開啟後的輸入區；仍須同房才能送悄悄話。
6. 玩家清單自己固定第一；自己的貼貼對象列右上角顯示「貼」，解除後消失。
7. 嘴巴三格、乳頭兩格、軀幹兩格應聯動亮起，各自共用去重後的動作清單。預設隱藏無法使用的動作；勾選「全部動作」後顯示停用項目與原因。說明在按鈕 title，手機不要求懸停才能完成操作。
8. 無工具時可以徒手梳理（TakeCare）及 Lite 的徒手抓撓；BrushItem 需要自己 Appearance 物品的 AllowActivity 包含 BrushItem，顯示物品名並附帶 ActivityAsset。未知衣物不能作為「擁有梳子」證據。徒手抓撓是 Lite 明確放寬原生 Needs-Scratch 的例外，不代表 BC 原生完全相同。
9. 只有施作者穿戴 Wings 時可使用施作者翅膀動作；只有目標穿戴時不應放行。相容勾選不繞過此條件。
