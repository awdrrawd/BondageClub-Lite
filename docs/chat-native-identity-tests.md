# 活動、社群協定與 Lite 識別

[文件導覽](README.md) · [第三方動作文字](third-party-dialogues.md) · [架構導覽（HTML）](https://github.com/awdrrawd/BondageClub-Lite/blob/Mater/docs/architecture.html)

## 原生活動與擴展文字

個人資料 → 互動 → SVG 部位格子／名稱 → 活動。沒有可繪製人物；桌面並列部位與動作，手机分頁選擇。嘴巴、乳頭、軀幹的連動格子共用去重清單。labels.ts 管理 Self／Other 標籤與別名；ItemPenis／ItemGlans 僅在目標具有對應身體資料時使用，實際群組仍映射回原生部位。

native-data.json 由本機 BC 定義靜態擷取活動、部位與物品條件；extension-data.json 由本庫翻譯及 extension-rules.json 產生。條目數以建置輸出為準；資料存在不表示已實作完整活動引擎。正常 build 不需要下載上游或執行插件。

原生項目送 Type: Activity 與 SourceCharacter／TargetCharacter／FocusGroupName／ActivityName，工具活動可附 ActivityAsset。一般 ECHO／小酥／LSCG 擴展項目送可讀 Action，不執行工具／數值／移動效果。**貼貼另走確認與外觀同步流程**，見[貼貼驗收](echo-cuddle-tests.md)。

## 判定邊界

- 「全部動作」預設不勾選，只顯示可用項目。勾選後顯示受限項目並啟用對未實作條件的相容判定；已知禁止条件仍停用。
- inventory 支援線上 Group／Name／Property 與完整 Asset 格式。Effect／活動 Block 合併 Asset 和 Property；Expose／Block／AllowActivity 等按實作優先序取值。同次列舉共用一次解析，不修改外觀。
- 未知插件物品略過無法辨識的部分，不讓無關活動全部停用，也不能作為已持有某工具的證據。
- 已知 Needs／TargetNeeds、梳子、項圈、ZoneNaked／TargetZoneNaked、目標部位封鎖、偏好與房間禁止仍有效。自己翅膀與目標翅膀、自己貓爪與目標貓爪分別判定。
- Lite actor policy 明確略過自己的 UseHands／UseArms／UseFeet／UseMouth／UseTongue／TargetZoneAccessible 與自身 Enclose 禁令；CantUse*／IsGagged 仍用於特殊變體。不是完整 BC 的角色限制模擬。
- 徒手 TakeCare 與 Lite 徒手抓撓可用；BrushItem 必須有 AllowActivity 包含 BrushItem 的實際物品。徒手抓撓是放寬原生 Needs-Scratch 的例外。
- 自身 Automatic／Hybrid 興奮與表情效果未模擬，僅提示；關係條件、動態插件條件與完整需求展開仍不齊全，地圖房仍限制活動。
- 角色／房間同步會刷新開啟的活動面板；點擊送出時再驗證，不能沿用舊資格。

更新上游才執行 build-native-activities.mjs／build-extension-rules.mjs；一般翻譯編譯走 catalog:compile。詳見[翻譯貢獻](../src/translations/README.md)。

## AFC 與 BCX 相容召喚

AFC 擴展戀人讀取公開共享關係。只向自己的 AFC 戀人且在好友名單內的人查詢房間，並只接受相應回覆。房間卡片比對搜尋 Friends 或 AFC 房名＋區域；不掃描其他玩家，不回傳自己的房間、不改 AFC 設定。查不到不等於沒有關係或已離線。

BCX 相容召喚接收普通 BEEP，依本次登入允許名單、關鍵字、有效房名／區域判斷。收到後顯示接受確認，未接受不離房；60 秒到期、關閉規則或登出後失效。不實作 BCX 私有強制規則、倒數或跨房自動跟隨。

## Lite 識別

進房、新成員加入及受限頻的 LCE Hello 回應可發送：

```json
{"Type":"Hidden","Content":"BCLiteHello","Dictionary":[{"client":"Lite"}]}
```

定向訊息可有 Target；Sender 由伺服器指定。沒有版本、帳密、服裝或插件清單。同頁只讀標記為 window.BCLite.client，不是遠端存取 API。

徽章需要觀看端支援 BCLiteHello；Lite 倉庫的修改不代表 LCE 已發布相容版本。原版 BC／不支援的版本不保證顯示。識別僅自報，不是身分驗證。

## 雙人與手機驗收

1. 一般穿衣角色測原生活動，完整版觀看端確認 Activity 封包及接收端效果；不要把送出當成功回執。
2. 開啟面板後改變工具、目標偏好、房間禁止或讓目標離房，送出時應再阻擋；「全部動作」不能略過已知禁止。
3. 自己有束縛／口塞時測 Lite actor policy；移除梳子、翅膀、貓爪後，對應工具活動仍停用。雙方皆無貓爪時猫爪梳毛／捏猫爪皆不可用；再分別由自己／目標穿戴驗證方向。
4. 讓小酥、LSCG、ECHO 觀看端發送帶名字／物品／部位／內嵌原文的動作，中、英、俄文皆檢查；缺少俄文的插件文字回退英文。普通 Chat 不套用文字表。
5. 檢查有／無原生及 AFC 關係的個人資料；在好友頁查 AFC 房名，關閉分享或離線不能冒充已確認在線。
6. 允許的會員送出符合召喚文字的普通 BEEP；先取消再接受。未允許會員、無房名、控制型 BEEP、過期邀請與關閉規則不得加入。
7. 支援識別的 LCE 觀看端先進房、Lite 後進房，再反向測試；只見 Lite、不見版本，Hidden 不進公開聊天。重新登入其他客戶端後不應殘留識別。
8. 手機與鍵盤測部位格子、聯動部位、動作清單、返回／Esc／Tab／Enter。操作說明不應只靠懸停；聊天、BIO 與輸入框仍可選字。

自動測試採模擬協定與 DOM；ECHO 貼貼另有專門雙人清單。Lite 不提供完整活動、服裝、興奮、表情、懲罰或插件引擎。
