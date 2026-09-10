# 第三方參考與素材

- `src/assets/lce-lounge.jpg`：依使用者要求取自本機 BC-LCE 的 `assets/BG-98.jpg`，未修改。BC-LCE 倉庫採 AGPL-3.0；隨附 `LCE-AGPL-3.0.txt`，素材不納入 Lite 自有程式的 MIT 授權聲明。圖片原作者／獨立授權未能由本機檔案確認；公開再散布前請確認你有素材使用權，否則移除此圖與對應背景選項。未複製 LCE JavaScript。
- 好友／BEEP：依 BC 原生訊息格式獨立實作；以本機 BC-FCM（MIT）的 `chat-sender.js` 為互通格式參考。未引入 FCM 的資料庫、UI 或附件解碼器；接收一般文字，忽略插件控制／附件封包。
- ECHO 相容性調查：https://github.com/SugarChain-Studio/echo-clothing-ext 的 `src/main.js`。未嵌入、執行或宣稱載入 ECHO；不支援其自訂資產操作及繪圖。

本機顯示背景預設關閉；只有開啟時瀏覽器才請求圖片。
