# 文件導覽

本目錄描述目前程式的行為與驗收方式，不作為逐次開發紀錄。最後對照原始碼：2026-09-11。歷史變更請查 Git；自動測試通過不代表已完成真實 BC、Cloudflare 或手機驗收。

## 要找什麼

| 用途 | 文件 |
| --- | --- |
| 系統、模組、狀態與更新邊界 | [架構說明](architecture.md)、[獨立 HTML 導覽](architecture.html) |
| 安裝、部署、中繼排錯與正式驗收 | [部署與驗收](deployment-and-tests.md) |
| 手機介面、前景探測、重連與登入回房 | [手機與連線](mobile-connection-tests.md) |
| 搜尋、建房、好友、聊天、回覆、翻譯及 DOM 更新 | [房間與聊天驗收](chat-layout-tests.md) |
| 本機歷史、快取、期限、匯出與帳戶隔離 | [本機紀錄](local-history-and-contacts.md) |
| 帳號、資料流向、媒體與外觀的保存界線 | [隱私與外觀](privacy-and-appearance.md) |
| 原生活動、擴展文字、AFC、召喚與 Lite 識別 | [活動與社群協定](chat-native-identity-tests.md) |
| ECHO 貼貼的確認、配對、寫入與雙人測試 | [貼貼驗收](echo-cuddle-tests.md) |
| URL／影音許可、安全詞與確認對話框 | [媒體與安全詞](links-safeword-tests.md) |
| 翻譯來源、覆寫與建置方法 | [翻譯貢獻指南](../src/translations/README.md) |
| 素材、圖示、BC 與插件文字來源 | [第三方素材](THIRD-PARTY-NOTICES.md)、[第三方文字](third-party-dialogues.md)、[授權文字](licenses/) |

HTML 架構導覽會建置到 `dist/docs/architecture.html`；其他 Markdown 是倉庫文件，不假設已隨網站部署。

## 2026-09-11 文件合併索引

| 舊文件 | 處理與現行位置 |
| --- | --- |
| social-preview-tests.md | 移除舊版本快照；功能驗收分入聊天、部署、隱私及貼貼文件 |
| ui-room-tests.md | 合併至房間與聊天驗收 |
| bio-private-text-tests.md | BIO／聊天翻譯合併至聊天驗收；保存行為以本機紀錄為準 |
| i18n-mobile-tests.md | 語系與手機驗收合併至聊天及手機文件；翻譯維護沿用貢獻指南 |
| community-features-tests.md | AFC／召喚合併至活動與社群協定；媒體／回覆分入各主題 |
| activity-search-recovery-tests.md | 活動條件合併至活動文件；搜尋／探測合併至手機與連線 |
| mobile-controls-and-assets.md | 手機控制列合併至手機文件；AEE／SCA 合併至隱私文件；圖示歸第三方素材 |
| login-rejoin-tests.md | 合併至手機與連線 |
| BC-Bot-Deploy-Guide.md | 移除；描述另一個 Render 離線 Bot，並非 Lite 部署或現行協定規格 |

授權全文、作者名單與來源說明保留；不因移除舊功能筆記而刪除授權資料。以上舊檔仍可從 Git 歷史查閱，不在 docs 另留一套互相衝突的副本。

## 維護規則

- 新功能更新所屬主題，避免再建立「本輪／新版」文件。
- 模組責任或資料流變動，同時更新 architecture.md 與 HTML 摘要。
- 保存方式以隱私與本機紀錄文件為準；更新功能時一併核對兩份。
- 驗收記錄需標明部署版本、裝置及實測結果；不要把待測步驟寫成已通過。
- 不固定抄寫 bundle 體積、測試數量及文字條目數；以當次建置與測試輸出為準。
