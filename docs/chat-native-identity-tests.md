# 聊天、原生活動與 Lite 識別驗收

## 已接上的 UI

- 好友卡片對自己的 AFC 擴展戀人提供查詢房間；個人資料不再重複放查詢按鈕。房間卡片依搜尋結果的 Friends 成員編號，或自己的 AFC 房間回覆（名稱＋區域）標示擴展戀人。不是掃描全部玩家；資料未分享或不在好友名單時無法保證查得到。
- 聊天採名稱／內容與右側時間、ID、Reply 分區。手機窄螢幕 metadata 換到右下，不擠壓內容。聊天、emote、Action／Activity、悄悄話、私訊及 OOC 分別有文字樣式。
- 點名稱預填 `/W 編號`，保留現有草稿，**不會直接發送**。目標不在同房時提示改用私訊，不自行改道。玩家資料仍從成員面板開啟。
- 私聊對象清單可收合，訊息由舊到新排列，輸入區在下方，共用聊天室訊息列。名稱顯示統一為「悄悄話」／「私訊」，協定仍是 Whisper／AccountBeep，並未新增外部私訊伺服器。

## 原生活動：已接入，但不是完整 BC 引擎

`src/action/native-data.json` 從本機 BC `ActivityFemale3DCG` 與部位資料擷取 67 個活動定義及 18 個區域 ID，只含判定資料，不載入人物圖像。`scripts/build-native-activities.mjs` 可重新擷取。此資料沿用 BC 原作者權利，不重新宣稱為 Lite 自有文字。

點個人資料工具列「互動」→ 人物線框或部位名稱 → 選活動。`src/ui/activity-dialog.ts` 使用 BC AssetGroup.Zone 矩形作為熱區，不載入人物圖片。個人資料不提供房間查詢／加入按鈕，右上角 X 關閉。

**相容發送預設開啟，可在面板取消：**原始線上封包缺少 AssetFamily 時比照 BC CharacterLoadOnline 使用 Female3DCG。尚未實作的裝備／姿勢／本機效果與缺少偏好資料顯示警告，而非一律鎖住。這不是完整條件驗證：相容模式可能送出完整版 BC 正常選單不會開放的活動。明確關閉的活動／區域偏好、Inactive 接收模式、房間禁止與未支援地圖距離仍然阻擋；每次送出重新檢查角色是否同房。取消相容模式恢復受限的保守判定。Lite 不會更改玩家偏好。

原生項目仍以 SourceCharacter／TargetCharacter／FocusGroupName／ActivityName 字典發出 `Type: Activity`。一般擴展項目以可讀 Action 文字送出，標示「文字模式」；ECHO 貼貼另走明確確認的道具／配對流程。

### ECHO／小酥／LSCG

`src/action/extension-data.json` 收錄 407 個已擷取的「對象／部位／文字鍵」選項，不代表 407 個完整活動引擎。`scripts/build-extension-data.mjs` 只從本庫翻譯來源建立索引；`catalog:plugins` 更新擷取資料後同步索引。`extensions.ts` 代入玩家名稱與部位，透過既有自訂 Action 通道發送，不安裝插件、不調用插件 hook、不送出 ActivityName。

軀幹／手臂包含「貼貼 · 鑽進懷裡」與「貼貼 · 抱入懷中」。這兩項確認後更新自己的 ItemMisc/贴贴，發送 Activity 與 ECHO 配對狀態；收到邀請的 Lite 玩家另需確認。已有 ItemMisc 道具不覆蓋，不實作跨房跟隨或完整 ECHO 引擎。詳見 [貼貼驗收](echo-cuddle-tests.md)。其他擴展項目的道具／數值／移動效果不執行。句子依中英文表渲染；沒有翻譯的名稱保留原文。

`labels.ts` 統一 Self／Other 標籤、子部位回退與缺字哨兵處理；插件擷取同時保留選單標籤及動作句子。ItemPenis／ItemGlans 是文字別名，只有目標 Appearance 含 Pussy/Penis 時使用，實際部位仍為 ItemVulva／ItemVulvaPiercings。LSCG 未提供中文的標籤仍使用英文，不能視為完整中文覆蓋。

對方的完整版 BC 可按自己的設定處理接收活動效果；若對方也是 Lite，沒有完整接收端興奮／表情引擎，不能保證產生相同效果。這一輪**尚未完成**自身 Automatic／Hybrid 興奮、表情計時、懲罰、道具變化、鏡像部位及所有插件活動引擎。灰色按鈕會說明原因。不要把封包送出視為接收端已成功執行的回執。

### 原生活動測試

1. 一般穿衣角色開啟個人資料，確認無房間按鈕、右上角 X 可關閉。點工具列「互動」，點人物線框或「耳朵」名稱；相容模式下 Whisper 活動應可送出（這是 BC 活動名稱，與 `/W` 通道不同）。取消相容模式應顯示尚未支援的裝備等原因。
2. 同房完整版 BC 玩家確認收到的是 Activity，而不是文字 Action；若接收端為 Automatic／Hybrid，核對原生效果。不應修改自己的 Appearance 或 OnlineSharedSettings。
3. 關閉目標部位／該活動偏好或加入 Arousal 禁止房間，相容模式仍應禁用。先開面板再讓目標離房，送出仍須拒絕。
4. 按 [貼貼驗收](echo-cuddle-tests.md) 分別測試 Lite／Lite 與 Lite／ECHO。未裝 ECHO 的完整版只能驗證文字，不能驗證插件道具與位置渲染。
5. 切換中英文，核對部位、貼貼標籤及提示。在手機測試熱區、小部位的名稱按鈕、面板捲動；按鈕／導航不應被長按圈選，但聊天、私訊、BIO、輸入框仍能選取複製。鍵盤 Tab／Enter／空白鍵也應能選部位。

## 無版本 Lite 標記與 LCE

Lite 進房／新成員進房時發送：

```json
{"Type":"Hidden","Content":"BCLiteHello","Dictionary":[{"client":"Lite"}]}
```

定向訊息可有 Target；Sender 由 BC 伺服器決定。收到同房 LCE Hello 可限頻回報，沒有自訂命令執行、插件版本、帳號清單、服裝或密碼。同頁只讀標記為 `window.BCLite.client === "Lite"`，不是遠端存取 API。識別是玩家自報，**不是身分驗證或防偽保證**。

本機 `../BC-LCE` 已修改 `features/social/hello.js`、`lite-identity.js` 及 `badges.js`，接收 BCLiteHello 並只畫「Lite」，不畫版本，也不設定 LCE／FBC 欄位。資料僅限當前房間記憶體，離房／斷線清除。

**需要兩邊更新：**部署 Lite，並讓觀看端更新這次建置的 LCE。只有 Lite 更新、觀看者仍使用舊 LCE 時不會自動出現徽章；原版 BC 也不會畫這個標記。LCE 的 `dist/assets/app.js` 已在本機重建，尚未發布。

驗收時讓 LCE 玩家先進房、Lite 後進房，再反向測試；確認只有 Lite 字樣、沒有版本、公開聊天沒有 Hidden 雜訊。重登其他客戶端後不應殘留 Lite 身分。

## 手機回歸

測試名稱點擊保留中文草稿、悄悄話 Reply 不洩漏到公開頻道、跨房私訊、長名稱／長網址換行、鍵盤開合，以及翻閱舊私訊時新訊息不把捲軸拉到底。AFC 查詢回來時不得重建正在輸入的房間搜尋框。這些仍需部署後實機核對；自動測試使用模擬 Socket 與 DOM。
