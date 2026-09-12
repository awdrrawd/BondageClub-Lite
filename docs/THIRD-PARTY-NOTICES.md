# 第三方參考與素材

- `src/assets/lce-lounge.jpg`：依使用者要求取自本機 BC-LCE 的 `assets/BG-98.jpg`，未修改。BC-LCE 倉庫採 AGPL-3.0；隨附 `LCE-AGPL-3.0.txt`，素材不納入 Lite 自有程式的 MIT 授權聲明。圖片原作者／獨立授權未能由本機檔案確認；公開再散布前請確認你有素材使用權，否則移除此圖與對應背景選項。未複製 LCE JavaScript。
- 好友／BEEP：依 BC 原生訊息格式獨立實作；以本機 BC-FCM（MIT）的 `chat-sender.js` 為互通格式參考。未引入 FCM 的資料庫、UI 或附件解碼器；接收一般文字，忽略插件控制／附件封包。
- ECHO 相容性調查：https://github.com/SugarChain-Studio/echo-clothing-ext 的 `src/main.js`。未嵌入、執行或宣稱載入 ECHO；不支援其自訂資產操作及繪圖。

本機顯示背景預設關閉；只有開啟時瀏覽器才請求圖片。

## 本機 SVG 圖示

- Phosphor Icons Core 的 regular SVG 保存在 `src/ui/icons/`，不用遠端圖示服務或整套字型。來源记录日期為 2026-09-11；MIT 與 Copyright (c) 2023 Phosphor Icons 保留於 [完整授權](licenses/phosphor-icons-MIT.txt)，並透過 `public/licenses/phosphor-icons-MIT.txt` 隨部署分發。
- flag-icons 的國旗 SVG 隨站打包，搭配語言文字標籤；MIT 授權保存於 `public/licenses/flag-icons-MIT.txt`。實际使用項目以 `src/ui/icons/` 與 `icons.ts` 為準，不固定抄寫圖示數量。

## BC 文字資料與 BIO

- `lz-string`：MIT，用於解析 BC 帶 U+256C 標記的 UTF16 壓縮 BIO；不執行 BIO 內容。
- `src/translations/bc/{messages,actions,items,groups}/` 的 `zh.json`／`ru.json`（差異）、`en.json`（基底）：由本機 `BCJS/Bondage-College-master/BondageClub` 的 `Screens/Interface`、`Assets/Female3DCG/AssetStrings`、`Assets/Female3DCG/Female3DCG`、`Screens/Online/ChatRoom/Text_ChatRoom`、`Screens/Character/Preference/ActivityDictionary` 的 CSV 及 TW／CN／RU 翻譯文字機械轉換。BC 文字資料權利屬原作者，不納入 Lite 自有程式的 MIT 授權聲明。
- 轉換腳本：`node scripts/build-text-catalog.mjs [BondageClub來源目錄]`。產物已隨專案保存，Cloudflare 建置不需要你的本機 BC 倉庫，也不在玩家登入時下載原始倉庫。
- 只取文字資料，未引入 BC 遊戲執行程式、服裝圖片或人物渲染。
- `src/action/native-data.json`：由同一本機 BC Female3DCG 定義表靜態擷取活動 ID、目標部位、前置条件與基礎身體名稱，供受限原生活動判定；資料權利屬 BC 原作者。
