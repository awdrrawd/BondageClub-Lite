# 貼貼與本輪 UI 驗收

## 實作範圍

`src/action/cuddle.ts` 集中貼貼前置條件與雙向配對資料。網路層只更新自己的 ItemMisc/贴贴，使用原生 ChatRoomCharacterItemUpdate；不送整包外觀或 AccountUpdate。Hidden/Luzi_XCharacterDrawState 分享位置狀態，不在 Lite 載入 ECHO 或人物圖片。既有 ItemMisc 道具不覆蓋，部分束縛／姿勢會保守阻擋。

協定參考 ECHO 貼貼活動與 [bc-modding-utilities 的 wearAndPair](https://github.com/SugarChain-Studio/bc-modding-utilities/blob/main/src/ChatRoomOrder/tools.js)、[狀態同步](https://github.com/SugarChain-Studio/bc-modding-utilities/blob/main/src/ChatRoomOrder/sync.js)。這不是完整 ECHO 引擎：不提供跨房牽引，不保證帳號持久保存或接收端執行成功。完整版觀看端需要 ECHO 才能呈現插件道具／位置。

## 雙人實測（尚需真人帳號驗證）

1. 兩位同房、ItemMisc 空白、沒有束縛／姿勢的 Lite 玩家，分別測試「鑽進懷裡」「抱入懷中」。發起前應要求確認；接收方拒絕時不得穿戴。接受後雙方各更新自己的單件道具，方向互為對應。
2. 換成 Lite 與 ECHO 玩家，在允許互動的設定下測試兩個方向。觀看端核對位置及道具；不應把「封包已送出」當作成功回執。
3. 任一方 ItemMisc 已有其他物品時阻擋，不可覆蓋。取消／逾時邀請不能穿戴；目標離房後不能接受。
4. 點「解除貼貼」、讓對方離房、或移除貼貼，核對配對清除。若該欄被換成其他道具，解除不得刪除替代道具；衣服、Property 等其他欄位保持原樣。
5. 刷新／斷線重連後核對外觀；配對僅保存在本次分頁記憶體，不承諾刷新後恢復位置關係。

## 翻譯與介面

1. 中英文各檢查原生、小酥、LSCG、ECHO 的選單標籤及動作句子。未提供翻譯仍保留來源文字，不應顯示 MISSING TEXT；動態插件自訂句子不保證全部涵蓋。
2. 目標沒有 Pussy/Penis 時不出現 ItemPenis／ItemGlans 專用動作；有時合併到外陰／陰部對應熱區，不另加人物格子。
3. 導航順序為搜尋、房間、私聊、好友、設定。進出訊息文字置中，時間及 ID 靠右。
4. 私聊選同一人，交替發送私訊與悄悄話：同一時間線、對方靠左自己靠右，有通道標籤。通道選單在輸入左側、送出在右側，加好友在標題最右；沒有編號輸入框、移除按鈕或 muted 樣式。
5. 手機檢查清單／聊天切換、長訊息換行與鍵盤開啟後的輸入區；仍須同房才能送悄悄話。
