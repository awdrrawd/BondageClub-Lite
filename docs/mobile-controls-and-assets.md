# 手機控制列與 AEE / shuangcustomassets 保留

## 資料保留，不是假裝安裝插件

Lite 沿用收到的完整 Appearance bundle，不呼叫完整版 BC 的 AssetGet／ServerBundledItemToAppearanceItem；未知物品不因本機沒有註冊資產而被移除。登入時複製完整 JSON，房內單件更新只替換指定 Group，其他 Property、Craft、顏色和插件欄位原樣保留。

本次對照的資料：

- BC-AEE：SingleGloveFX / SingleGlove、ItemCanvas1–3 與 Mask/Vis 伴隨層；Property.CustomDraw、CustomDrawSPS、SGSide、SGScope，以及 OnlineSharedSettings.AEE 的字型設定。
- shuangcustomassets：Name 為「自定义贴图」，Property.Textures 內含來源 URL、姿勢設定與顯示參數，可能位於原生 Item* 格子；不把它一律視為束縛。

`src/safety/plugin-appearance.ts` 管理純裝飾例外：安全詞解除保留不帶已知 Effect／Block 的 SCA 貼圖。帶效果的原生 Item 格子仍移除；未知插件束縛不能承諾全部解除。安全詞回復仍採本次登入的完整外觀快照。一般互動不改寫整包外觀；貼貼只依確認替換自己的 ItemMisc。

不下載或解析插件圖片、壓縮繪圖、不載入插件腳本，不宣告 AEE/SCA 已安裝，不讀寫其私人 ExtensionSettings 備份。若伺服器提供的外觀已缺少物品，Lite 不自動從舊快照補回，以免撤銷合法移除；請在原插件中恢復。沒有相應插件的觀看端仍不能繪製自訂素材；保留資料不等於提供完整渲染器。

## 行動限制

網路層以 Lite actor policy 檢查動作：自己的 UseHands、UseArms、UseFeet、UseMouth、UseTongue、TargetZoneAccessible 及自己的 Enclose 不再作為普通動作禁令。CantUse*、IsGagged 仍依實際狀態提供特殊變體。Needs-* 工具（含梳子）、翅膀／貓爪等外觀條件、對方部位限制、明確拒絕和房間規則仍有效。不自動啟用帳號安全詞，不保證完整版接收端的活動效果。

## 手機介面

760px 以下：

- 頂列為 ICON／玩家／安全詞，右側語系／登出；長名稱省略，不把右側控制另推一整行。
- 搜尋框／搜尋圖示／分區圖示／語言／篩選。聚焦搜尋框擴展，隱藏其餘選項，保留搜尋按鈕；移出焦點或點別處縮回。
- 分區選單以圖示＋文字按鈕選擇；沿用 BC 值：空字串＝女性、M＝男性、X＝混合。桌面保留原生 select。Escape 可關閉，Tab 可操作。
- 結果列依序總數／分頁／排序。導航圖示不會被未讀數更新刪除。

`npm run dev:ui` 可免登入核對控制列；外觀及真實活動需雙人驗收。

## 驗收

1. 完整版 AEE/SCA 保存自訂物品，登入 Lite，請裝有相應插件的同房玩家比較前後。對方換一件普通衣服後，核對其他貼圖資料未改變。
2. 在測試帳號確認安全詞解除：裝飾貼圖保留，普通繩索移除。若物品資料原已遺失，不宣稱 Lite 可還原。
3. 自己受束縛／戴口塞時測試普通互動；移除實際梳子或翅膀後，對應工具動作仍應停用。对方禁止活動時仍不可發送。
4. 用 320/390/760px 視窗及長玩家名稱測試頂列；切換性別後立刻自動搜尋，值與图示相符。聚焦、Tab、點別處及 Escape 都能結束相關展開狀態。
5. 新訊息更新未讀數後，五個導航 SVG 仍保留。

## 圖示授權

使用 [Phosphor Icons Core](https://github.com/phosphor-icons/core) 的 10 個 regular SVG，於 2026-09-11 取自官方 main 並固定保存於本庫 `src/ui/icons/`，不依賴遠端圖示服務或整套字型。

MIT 授權及 Copyright (c) 2023 Phosphor Icons 保留於 `docs/licenses/phosphor-icons-MIT.txt`，並透過 `public/licenses/phosphor-icons-MIT.txt` 隨部署分發。引用：[官方授權](https://github.com/phosphor-icons/core/blob/main/LICENSE)。不修改原圖形路徑，只加尺寸、顏色與無障礙呈現屬性。
