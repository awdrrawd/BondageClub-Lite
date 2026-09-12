# BondageClub-Lite

[English](README.en.md) · [文件導覽](docs/README.md)

非官方 Bondage Club 輕量文字客戶端，專注聊天，不載入人物繪圖或完整遊戲引擎。

## 功能

- 房間搜尋、篩選、建立與加入。
- 聊天、悄悄話、BEEP、好友與最近聯絡人。
- 私訊未讀提示、回覆及獨立通知音效開關。
- 本機歷史搜尋，支援 TXT、HTML 與 Excel 匯出。
- 自動重連，暫時斷線保留畫面與草稿，不自動補送。
- 中、英、俄文介面、手機版面、個人資料查看與文字活動。

不提供衣櫃、人物渲染或完整插件功能。

## 開發

使用 Node.js 22.13+：

```sh
npm ci
npm run dev:ui
```

以上開啟免登入的模擬預覽。正式部署使用 Cloudflare Pages；建置、測試與中繼設定見[部署指南](docs/deployment-and-tests.md)。

## 文件

- [架構說明](docs/architecture.md)
- [歷史紀錄與匯出](docs/local-history-and-contacts.md)
- [隱私與資料保存](docs/privacy-and-appearance.md)
- [翻譯貢獻](src/translations/README.md)

帳密與遊戲流量經部署站的 Cloudflare 中繼；請使用信任的部署。聊天歷史預設存於本機，登出不會刪除已保存紀錄。

## 授權

自有程式採用 [MIT](LICENSE)。第三方素材與文字依[各來源授權](docs/THIRD-PARTY-NOTICES.md)。
