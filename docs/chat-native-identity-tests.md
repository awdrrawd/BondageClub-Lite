# 聊天、原生活動與 Lite 識別驗收

## 已接上的 UI

- 好友卡片對自己的 AFC 擴展戀人提供查詢房間；個人資料不再重複放查詢按鈕。房間卡片依搜尋結果的 Friends 成員編號，或自己的 AFC 房間回覆（名稱＋區域）標示擴展戀人。不是掃描全部玩家；資料未分享或不在好友名單時無法保證查得到。
- 聊天採名稱／內容與右側時間、ID、Reply 分區。手機窄螢幕 metadata 換到右下，不擠壓內容。聊天、emote、Action／Activity、悄悄話、私訊及 OOC 分別有文字樣式。
- 點名稱預填 `/W 編號`，保留現有草稿，**不會直接發送**。目標不在同房時提示改用私訊，不自行改道。玩家資料仍從成員面板開啟。
- 私聊對象清單可收合，訊息由舊到新排列，輸入區在下方，共用聊天室訊息列。名稱顯示統一為「悄悄話」／「私訊」，協定仍是 Whisper／AccountBeep，並未新增外部私訊伺服器。

## 原生活動：已接入，但不是完整 BC 引擎

`src/action/native-data.json` 從本機 BC `ActivityFemale3DCG` 與部位資料擷取 67 個活動定義及 18 個區域 ID，只含判定資料，不載入人物圖像。`scripts/build-native-activities.mjs` 可重新擷取。此資料沿用 BC 原作者權利，不重新宣稱為 Lite 自有文字。

點個人資料「互動」→ 選部位 → 選活動。送出前 protocol 再次核對角色仍同房、活動適用對象／部位、房間 Arousal 限制、雙方活動偏好及目標區域偏好；以原生 SourceCharacter／TargetCharacter／FocusGroupName／ActivityName 字典發出 `Type: Activity`。不再由這個面板發出假裝有遊戲效果的文字 Action。

**目前限制非常保守：**只允許已知原生基礎身體／毛髮外觀、無額外裝備 Property、無 ActivePose 的角色，及 UseMouth／UseTongue／UseHands／UseArms／UseFeet／MoveHead 可直接判定的活動。包含衣服／道具／未知身體、地圖距離、ZoneAccessible 等複雜條件、Needs-* 道具需求、聲音懲罰／表情／刺激等本機連動時會禁用。自己必須原本就是 Manual 興奮模式；Lite 不會擅自更改偏好來解鎖按鈕。

對方的完整版 BC 可按自己的設定處理接收活動效果；若對方也是 Lite，沒有完整接收端興奮／表情引擎，不能保證產生相同效果。這一輪**尚未完成**自身 Automatic／Hybrid 興奮、表情計時、懲罰、道具變化、鏡像部位及所有插件活動引擎。灰色按鈕會說明原因。不要把封包送出視為接收端已成功執行的回執。

### 原生活動測試

1. 先用可恢復的測試角色，確認雙方願意測試，自己使用 Manual 模式且沒有目前不支援的裝備／姿勢。在「耳朵」選擇可用的 Whisper 活動（這是 BC 活動名稱，與 `/W` 通道不同）。
2. 同房完整版 BC 玩家確認收到的是 Activity，而不是文字 Action；若接收端為 Automatic／Hybrid，核對原生效果。不應修改自己的 Appearance 或 OnlineSharedSettings。
3. 關閉目標部位／該活動偏好、加入 Arousal 禁止房間、戴上束縛或切換姿勢，應看到禁用原因。先開面板再讓目標離房，送出仍須拒絕。
4. 切换語言，核對部位、活動標籤及禁用說明。需要工具或未支援條件的動作不可只送文字冒充成功。

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
