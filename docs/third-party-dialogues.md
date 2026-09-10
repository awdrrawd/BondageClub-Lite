# 第三方動作文字來源

`scripts/build-plugin-catalog.mjs` 只解析本機來源的字面值，不執行插件。來源整理於 `src/translations/action/{xiaosu,lscg,echo}/`（英文基底＋中文差異），再由編譯器合併成按需載入產物；人工修正放 `src/translations/overrides/`；未收錄動作可使用封包提供的可讀替代文字。

這些來源的文字保留原授權，不因放入 Lite 而改為 Lite 自身程式碼的授權。不同來源的條目分別受其原授權約束；再散布與商業使用前須核對各授權，尤其 ECHO 的非商業／相同方式分享條款及 LSCG 的 GPL 條款。

| 來源與擷取位置 | 辨識 | 本機來源附帶授權 |
| --- | --- | --- |
| `../XiaoSuActivity/src/Modules/MActivity.ts`、`translation/TW.json`、`EN.json` | `XSAct_` 名稱 | MIT，2024 Iceriny；[完整文字](licenses/XiaoSuActivity-MIT.txt) |
| `../BCJS/LSCG-main/src/Modules/activities.ts` | `LSCG_` 名稱 | [GNU GPL v3](licenses/LSCG-GPL-3.0.txt) |
| `../BCJS/echo-activity-ext-main/src/components/` | 原始 activity.Name | [來源授權與作者名單](licenses/ECHO-activity-license.txt)，CC BY-NC-SA 4.0 |

擷取會將各來源的模板組織成 BC `ChatOther-部位-動作`／`ChatSelf-部位-動作` 查表；小酥的 `{0}`／`{1}`／`{2}` 改為 BC 字典佔位符／對應部位文字。LSCG 無中文版本的句子保留英文。未載入插件邏輯、圖像或音效。重新擷取請在開發環境保留上述來源目錄後執行 `node scripts/build-plugin-catalog.mjs`；部署建置無需下載來源仓庫。

LCE 的網域許可、AFC 的共享資料／房間 BEEP、BCX 的召喚 BEEP／替代文字、QuickInteraction 的文字 Action 機制用作協定及行為參考；沒有打包其完整執行引擎。

## ECHO 衣物名稱

`scripts/build-item-catalog.mjs` 從本機 `../BCJS/echo-clothing-ext-main/src/components/` 的字面值註冊資料擷取名稱，略過 `0模板`。輸出到 `src/translations/items/echo/`、`src/translations/groups/echo/`，採英文基底與中文差異；只包含名稱，不包含圖像、服裝定義或執行程式。

這些文字沿用 ECHO 衣物倉庫的 CC BY-NC-SA 4.0；[原始授權與完整作者名單](licenses/ECHO-clothing-license.txt)。作者包括 Echo、炉子、dynilath、星涟、折叠的爱、爱丽丝、DaBai、Berry、王木木。擷取將名稱改為 `Asset.群組.名稱`／`Group.群組` 查表，明確的舊名稱修正加為別名；不重新授權為 MIT。
