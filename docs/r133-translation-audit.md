# R133 翻譯檢查（2026-10-18）

比較 Lite `ca1a14e` 與 BC 鏡像 `0d4c1cf69ef8eed7acf301f51f831b3c34c1f6f4`（上游 `226381ce84c2`，R133）。

## 已修復的更新流程

- TextCache 文字採識別鍵優先查譯文，兼容舊版英文原文鍵；資產名稱仍按英文查表。
- 資產來源改為 `Assets/AssetStrings` 與 `Assets/Female3DCG`，下載及本機擷取保留舊子目錄路徑回退。下載仍固定同一 commit，非 404 錯誤不略過。
- TXT 按兩行一組解析，避免把上一筆的譯文誤當下一個來源鍵。
- 檢查 R133 `ActivityAsset` 及反身代名詞佔位符；繁中／簡中候選也經過驗證，避免採用遺失物品的譯文。

Lite 使用自己的 JSON 字庫；InformationSheet/MainHall 的外掛修正不會直接更新 Lite。

## 尚待審校的字庫更新

以修正後擷取器在隔離目錄產生候選資料，沒有覆寫 Lite 現有字庫或人工 overrides。

| 分類 | 新鍵 | 原文變更 | 移除 |
| --- | ---: | ---: | ---: |
| actions | 31 | 20 | 0 |
| messages | 214 | 4 | 1 |
| items | 13 | 0 | 2 |
| groups | 0 | 0 | 0 |

合計新增 258 個來源鍵、24 個原文變更、3 個移除；這是來源差異，並非 258 句全部都缺少上游翻譯。

其中 18 個原文變更仍有簡中人工覆寫，需連同新字庫一起審校。例如 `ChatOther-ItemArms-GaggedKiss` 已由固定的 gag 改為 `ActivityAsset`，舊覆寫仍寫死口塞；`ChatSelf-ItemMouth-MoanGagAngry` 的舊覆寫也未保留新的物品佔位符。這些舊句子目前仍搭配 Lite 的舊英文基底，不能只改其中一份。

後續可用 `npm run catalog:bc -- <R133來源目錄>` 產生候選，再審核 `src/translations/bc/` 和各語言 `overrides/`，尤其是動作佔位符及新增動作覆蓋測試。

## 驗證

完整 `npm run ci`：文件、型別、建置及 317 項測試通過。最後增加 ActivityAsset 驗證後，6 項更新流程測試再次通過。未部署、未進行真實聊天封包測試。
