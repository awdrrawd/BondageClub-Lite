# R132 相容性

[文件導覽](README.md)

來源為本機 Bondage-College-Mirror-bondageclub 的 R132 原始碼；CHANGELOG 記錄更新日期 2026-09-16，記錄的 commit 為 `1bb83cc9778291cd2b06019978c0dfec4ce65308`（非本機快照的 Git 驗證值）。主要變更為 #6625 物品屬性精簡、#6655 接收端完整初始化，以及 #6561 穿戴物品 Craft 精簡。

`resolveItemProperties` 是共用的唯讀遊戲判定入口。動作、牽繩與安全詞使用同一份 R132 選項資料；支援預設及部分 TypeRecord、typed/modular 選項、子選項、震動模式、CopyConfig、LockedBy 和 IsLeashed。舊完整 Property 的明確欄位保留，不覆蓋插件提供的效果。

原始 Appearance、未知插件欄位與部分 Craft 仍原樣保存，登入、整房、單人、加入及單件更新都在使用時解析。衍生資料不寫回角色封包或帳戶；不把精簡 Craft 當完整配方，也不重新壓縮未知插件內容。這不是 WebSocket 壓縮，relay 與 BIO 的 LZ-String 格式不變。

資料產生器僅解析靜態設定，不執行遊戲或插件 hook。未知初始化 hook、無法解析的規則或非法選項不套用推測的衍生屬性；動作回到原有的基礎資產與明確 Property 判定，不因單件資料不足封鎖整個動作清單。已知封鎖效果、工具需求、偏好與互動權限仍生效。牽繩自動移動仍要求完整判定。純顏色透明度初始化不影響所擷取的遊戲欄位。這份解析器不是完整遊戲執行環境。

更新：`npm run catalog:native -- <R132來源>/Assets/Female3DCG/Female3DCG.js`。來源須包含同版的 Female3DCGExtended、VibratorMode 與 SlaveCollar 腳本。生成的兩份 JSON 提交入庫，正常建置不依赖外部遊戲目錄。

建房增加 `Location` 分類，供設定房間不分享位置的要求。Lite 現有 beep 使用 IsSecret，不對 AFC 位置請求自動回傳自己的房間；此選項不代表能阻止其他客戶端或插件分享位置。

驗證包括完整／精簡 DuctTape 動作封鎖一致、預設效果、模組與子選項、鎖與牽繩、安全詞保留裝飾項圈和 Craft，以及所有角色同步入口不改寫原始資料。未進行正式帳號登入驗證。

動作篩選也擷取 `SetPose`、`AllowActivePose` 與 `MirrorActivitiesFrom`，依雙方實際穿戴物品還原姿勢和部位可接觸性。`Needs-` 使用施作者道具，`TargetNeeds-` 使用接收者道具；原版清單保留每件可用道具的選項，送出時重新確認所選道具。抓撓遵循原版的指甲、爪或工具需求，沒有裸手強制放行例外。

插件條件擷取保留模板繼承與可靜態解析的物品、姿勢及布林組合，不執行插件回呼。依賴插件內部抓握、牽繩或其他執行狀態且無法判定的條件仍標示不支援，不代表完整重現插件執行環境。

判定流程分層為：原始 Appearance → `resolveItemProperties` 還原缺省欄位 → `appearanceState` 建立唯讀穿戴狀態 → `createActivityContext` 共用雙方資料。每次產生清單各解析一次，送出時重新建立最新清單，直接使用其中已驗證的道具。明確的舊完整欄位仍優先；省略的預設 TypeRecord 只在判定副本補齊，不寫回封包。

一般互動權限依 `ServerChatRoomGetAllowItem` 的方向判定：A 對 B 操作時檢查 B 允許誰操作，以及 A/B 的關係，不要求 A 的接收權限也允許 B。道具另檢查 B 的 `BlockItems`／`LimitedItems`，支援舊陣列、新分組物件和已還原的 PermissionItems。Limited 的戀人關係依接收者資料判定；整件物品的明確 Block 也始終生效。原版、插件和貼貼共用房間／接收者限制；貼貼的欄位取代仍使用 Lite 既有確認流程。停止貼貼屬於解除自身狀態，可獨立使用。

已移除忽略施作者拘束的替代路徑，以及將未知條件或缺少偏好資料轉為可用的相容模式。ALL 只影響顯示，不影響送出資格。這些不一致和早期 NoMeter 漏判是 Lite 自身的問題；R132 精簡封包則暴露了直接讀取 Property、不完整還原衍生資料的缺陷，不能把所有問題歸因於新版遊戲規則。

可執行 `node scripts/audit-activity-filters.mjs <R132來源目錄>`，以該目錄的遊戲函式與 Lite 對照。物品／部位矩陣涵蓋道具、口塞、鏡像部位、衣物、貞操及強制姿勢；另比較雙方互動權限和型態道具權限。物品矩陣的遊戲端使用 Lite 還原後的物品資料，因此不是對還原器的獨立驗證；完整／精簡封包等價性另由固定案例回歸測試覆蓋。均不能視為實際帳號驗證。地圖距離與插件內部執行狀態仍未完整模擬，地圖房間維持限制。

臀部清單的另一類缺漏與 R132 壓縮無關：ECHO 的 `fromTemplateActivity` 文字以前未展開，導致戳臀部等動作即使有條件資料也不會進入選單。擷取器現在靜態展開字面值模板和 map，不執行插件程式。尾巴撫摸的兩個同名關係分支以 OR 合併，保留尾巴及手部條件；關係採雙向戀人或指定方向的所有權判定。LSCG 對 Pinch 新增的臀部／臉頰部位以文字擴充選項提供，不改寫原版活動。LSCG Grab／Chomp 依賴牽引模組持續狀態，目前仍不支援；不可只憑尾巴物品存在就放行。新增模板的多語系文字由本地 `scripts/translate-template-actions.mjs` 產生，無外部翻譯服務。
