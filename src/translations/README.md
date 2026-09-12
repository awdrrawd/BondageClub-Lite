# 翻譯貢獻指南

翻譯資料集中在此；執行邏輯在 `src/i18n/`（UI）與 `src/action/`（遊戲及插件文字）。JSON 只包含文字，不放腳本、HTML 或載入網址。

互動面板的擴展文字選項索引在 `src/action/extension-data.json`，由 `scripts/build-extension-data.mjs` 從 ECHO／小酥／LSCG 英文鍵生成，不要手改。`npm run catalog:compile`、build／dev 會同步更新索引；其他語言句子仍沿用同一份文字表，不複製句子到索引。新增其他插件的「可發送文字選項」還需把來源名稱加入該腳本；這不會接入插件道具或活動引擎。

## 修改哪個檔案？

| 需求 | 位置 |
| --- | --- |
| 修改按鈕、說明、錯誤提示 | `ui/zh.json`、`ui/en.json`、`ui/ru.json` |
| 人工補翻／修正原生 BC 或既有插件句子 | **優先用 `overrides/zh.json` 或 `overrides/en.json`** |
| 新增另一個插件的文字來源 | `action/插件名稱/en.json`，可選其他語言檔 |
| 新增插件物品／部位名称 | `items/插件名稱/en.json`、`groups/插件名稱/en.json` 及語言差異 |
| 更新 BC 官方文字 | `npm run catalog:bc -- 上游BC目錄` |
| 更新現有三個插件的靜態擷取文字 | `npm run catalog:plugins` |
| 更新 ECHO 衣物名稱 | `npm run catalog:items`（可傳入 components 目錄） |

`bc/{messages,actions,items,groups}/` 與目前 `action/xiaosu`、`action/lscg`、`action/echo`、`items/echo`、`groups/echo` 是擷取器管理的資料，再擷取會覆寫。不希望被覆寫的貢獻放 `overrides/`；擷取腳本不接觸它。上游更新造成鍵名移除或改動時，人工覆寫也需要核對，不能只依賴舊鍵一直有效。

## 英文基底與差異覆寫

每個動作來源的 `en.json` 保存鍵與英文／原始句子。`zh.json` 只存與英文不同的內容：沒有翻譯時不寫該鍵，由英文回退。LSCG 的空 `{}` 中文檔是刻意的，不是遺失資料。不需要新增整份 `bc-messages-xx.json`。

例：在 `overrides/zh.json` 合併新增一筆（不要覆蓋其他人的條目）：

```json
{
  "ChatOther-ItemHead-LSCG_Bap": "SourceCharacter輕拍了TargetCharacter的頭。"
}
```

保留精確鍵名與 `SourceCharacter`、`TargetCharacter`、`DestinationCharacter`、`FocusAssetGroup` 等原有佔位符；物品鍵使用 `Asset.部位.物品`，部位鍵使用 `Group.部位`。不可把玩家名稱寫死。JSON 不可有註解／尾端逗號，值必須是非空字串；移除不需要的覆寫鍵即可恢復回退。

優先序：各來源英文＋選定語言 → `overrides/en.json` → `overrides/選定語言.json`。人工英文覆寫會影響所有語言，若只想改中文就只修改中文覆寫。不同來源不可重複宣告英文基底鍵；有意修改已有鍵請使用 overrides。

**封包附帶原文仍優先於靜態表。** 這是為了保留插件動態句子；這類訊息目前不保證跟隨 UI 語言切換。新增靜態翻譯不會蓋掉封包原文，也不會執行插件。未知動態格式應在 `src/action/embedded.ts` 或新的純文字解析模組中支援，並加入測試。

UI 文案不同於動作差異檔：`ui/en.json` 與 `ui/zh.json` 的鍵與 `{0}` 等數字佔位符必須一致。UI 的鍵型別及語言選擇由 `src/i18n/index.ts` 管理。

### 動作選單共用名稱與部位回退

`src/action/labels.ts` 共用 QuickInteraction 的主部位映射：Mouth2/3 → Mouth、Torso2 → Torso、NipplesPiercings → Nipples、NeckAccessories/Restraints → Neck、Handheld → Hands。先查共用覆寫 `Label-Activity-動作名`，再查實際部位／解剖別名與主部位的 `Label-ChatOther/ChatSelf`，最後保留可讀的原名。無須為每個子部位複製字典。

例如 `overrides/zh.json` 中 `"Label-Activity-LSCG_Nuzzle": "蹭蹭"` 可翻譯所有部位的同一動作名稱。本輪補上 30 個 LSCG 共用中文名稱。這是人工翻譯資料，不是程式內硬編碼；若不同部位需要不同名稱，改用原有完整 Label 鍵並移除共用覆寫。共用名稱不會取代聊天句子，後者仍使用完整 Chat 鍵及佔位符；來源沒有中文或封包自帶動態句子時，繼續回退原文。

## 新增語言

文字編譯器遞迴發現 `bc/`、`action/`、`items/`、`groups/` 內含 `en.json` 的來源目錄，以及 `overrides/` 下的語言 JSON，使用小寫標籤（例如 `fr`、`pt-br`）。只需補有翻譯的鍵。

要讓使用者能選用新語言，還需新增完整 `ui/語言.json`，更新 `src/i18n/index.ts` 的 Locale／字典／狀態重譯語言列表、`src/action/catalog.ts` 的 locale 型別，以及 `src/ui/app.ts` 的語言選單與偏好驗證；更新語言測試。新增 JSON 本身不會自動新增 UI 選項。

## 建置與驗證

```sh
npm run catalog:compile
npm run build
npm test
```

build 和 dev 的啟動前都會自動編譯。dev 運行期間改翻譯後要再執行 `npm run catalog:compile`，由 Vite 更新產物。一般建置只需本倉庫；不依賴上游插件目錄。

產物在 `src/action/generated/`（忽略版控），包含一份英文基底與每種語言的索引差異。數字索引由基底鍵順序決定；不要手改、單獨搬運或提交產物。Vite 會產生一組對應雜湊檔；英文載入一份，中文／俄文載入英文基底加所選語言差異，瀏覽器模組快取可重用基底。

請在測試帳號用相同動作核對參與者、物品、自身／他人句型及語言切換，且確認未知鍵仍可回退。字典測試不鎖住全部翻譯的雜湊，正常翻譯貢獻不必更新固定快照。

## 物品名稱的限制與測試

BC 物品在 `bc/items/`，部位在 `bc/groups/`。例如人工修正 `overrides/zh.json` 中的 `Asset.Garters.枪套`，即可翻譯 ECHO 該物品；不要改動 `枪套` 這個識別鍵，只改右側顯示文字。

ECHO 擷取器只解析靜態註冊資料、明確群組與有依據的舊名修正，不執行插件或下載圖片。目前收錄 465 個物品鍵（含別名）、11 個部位。掃描時有 85 個 addAssetWithConfig 呼叫未能整體靜態辨識；這不是剩餘物品數或完整覆蓋率，部分批次與其他生成形式也可能未涵蓋。未知物品保留原名，鏡像群組及執行期改名不自行猜測。LSCG／小酥目前檢查的來源未找到可沿用此格式的獨立物品註冊資料，沒有憑空新增物品字典。

用同房玩家對你使用物品，核對 ActionUse／ActionRemove 的物品及部位名；切换中英文確認名稱更新。自訂製作品的 CraftName 必須維持玩家原文。未裝 ECHO 也應能讀取已收錄的名稱，但不代表能操作或繪製 ECHO 物品。自動測試使用模擬字典，不取代真實封包驗收。

## 授權與來源

新增或修改第三方文字請保留來源、作者及原授權。參考根目錄 `docs/third-party-dialogues.md` 與 `docs/licenses/`；ECHO 動作文字與 LSCG 不應被宣稱全部改為 MIT。

## 俄文

介面使用完整的 ui/ru.json。catalog:bc 同時擷取原版 RU 文字，分入 bc 的動作、訊息、道具與部位目錄；原版缺漏及尚未翻譯的插件文字回退英文。擷取時檢查角色、道具、部位與代名詞替換標記，標記不一致的譯文不採用。不要翻譯協定鍵、玩家姓名、聊天、房名或 CraftName；俄文格變化不自動套用到玩家自訂名稱。上游用詞及語法仍需俄語使用者實測校對。
