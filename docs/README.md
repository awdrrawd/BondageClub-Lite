# 文件導覽

[返回首頁](../README.md) · [English index](README.en.md) · [架構導覽（HTML）](https://bondageclub-lite.pages.dev/docs/architecture/)

功能細節、架構、部署與驗收集中在這裡。歷史變更請查 Git。

## 要找什麼

| 用途 | 文件 |
| --- | --- |
| 插件與機器人事件、操作入口及限制 | [插件 API](plugin-api.md) |
| 系統、模組、狀態與更新邊界 | [架構說明](architecture.md)、[架構導覽（HTML）](https://bondageclub-lite.pages.dev/docs/architecture/) |
| CI、套件更新、健康檢查與後台設定 | [自動化與操作步驟](automation.md) |
| 哪些倉庫變更觸發 Cloudflare 部署 | [建置觸發規則](cloudflare-builds.md) |
| 安裝、部署、中繼排錯與正式驗收 | [部署與驗收](deployment-and-tests.md) |
| 手機介面、前景探測、重連與登入回房 | [手機與連線](mobile-connection-tests.md) |
| 搜尋、建房、好友、聊天、回覆、翻譯及 DOM 更新 | [房間與聊天驗收](chat-layout-tests.md) |
| 本機歷史、搜尋、未讀、期限及 TXT／HTML／Excel 匯出 | [本機紀錄](local-history-and-contacts.md) |
| 帳號、資料流向、媒體許可、通知音效與外觀保護 | [隱私與外觀](privacy-and-appearance.md) |
| 原生活動、擴展文字、AFC、召喚與 Lite 識別 | [活動與社群協定](chat-native-identity-tests.md) |
| ECHO 貼貼的確認、配對、寫入與雙人測試 | [貼貼驗收](echo-cuddle-tests.md) |
| URL／影音許可、安全詞與確認對話框 | [媒體與安全詞](links-safeword-tests.md) |
| 翻譯來源、覆寫與建置方法 | [翻譯貢獻指南](../src/translations/README.md) |
| 素材、圖示、BC 與插件文字來源 | [第三方素材](THIRD-PARTY-NOTICES.md)、[第三方文字](third-party-dialogues.md)、[授權文字](licenses/) |

「架構導覽（HTML）」直接開啟已部署的網站頁面。原始檔位於 `docs/architecture/index.html`，部署時建置到 `dist/docs/architecture/index.html`；其他 Markdown 是倉庫文件，不假設已隨網站部署。

## 維護規則

- 新功能更新所屬主題，避免再建立「本輪／新版」文件。
- 模組責任或資料流變動，同時更新 architecture.md 與 HTML 摘要。
- 保存方式以隱私與本機紀錄文件為準；更新功能時一併核對兩份。
- 驗收記錄需標明部署版本、裝置及實測結果；不要把待測步驟寫成已通過。
- 不固定抄寫 bundle 體積、測試數量及文字條目數；以當次建置與測試輸出為準。
