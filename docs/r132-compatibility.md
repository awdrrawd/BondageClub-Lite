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

可執行 `node scripts/audit-activity-filters.mjs <R132來源目錄>`，以該目錄的遊戲函式與 Lite 對照雙方物品／部位判定。矩陣涵蓋原版道具、口塞、鏡像部位、衣物、貞操及強制姿勢；房間、偏好及個別物品權限不在此比對範圍內，不能視為實際帳號驗證。
