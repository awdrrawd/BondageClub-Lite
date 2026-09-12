# Cloudflare 建置觸發範圍

[文件導覽](README.md) · [架構導覽（HTML）](https://github.com/awdrrawd/BondageClub-Lite/blob/Mater/docs/architecture/index.html) · [部署與驗收](deployment-and-tests.md)

目標網站：[bondageclub-lite.pages.dev](https://bondageclub-lite.pages.dev/)。在後台核對專案的 pages.dev 網址相符後再套用規則。

只改 Markdown、一般 docs 文件或測試時，不需要重新部署網站。架構 HTML／CSS 是正式網頁，修改時仍需部署。

## 套用設定（Cloudflare 後台）

進入 Workers & Pages → 本專案 → Settings → Build → Build watch paths，分別填入下列規則並儲存。

Include paths：

```text
src/*
public/*
functions/*
scripts/*
docs/architecture/*
index.html
package.json
package-lock.json
vite.config.*
tsconfig*.json
wrangler.*
.npmrc
.nvmrc
.node-version
.cloudflare/*
```

Exclude paths：

```text
*.md
tests/*
src/preview/*
src/action/generated/*
```

規則也保存於 [build-watch-paths.json](../.cloudflare/build-watch-paths.json)，供核對與維護。**Cloudflare 不會自動讀取這個 JSON；必須在後台套用，單純提交檔案不會改變觸發方式。** 不要把它放進 _routes.json：路由與建置觸發是不同設定。

## 哪些變更會部署

| 變更 | 觸發建置 |
| --- | --- |
| README、docs 下的 Markdown／授權原文 | 否 |
| 測試及模擬 UI 預覽 | 否 |
| src 程式、翻譯 JSON、public 中繼／靜態資源 | 是 |
| 建置腳本、依賴、Vite／TypeScript／Wrangler 設定 | 是 |
| docs/architecture 的 HTML／CSS | 是 |
| 同次推送同時包含 MD 與程式變更 | 是 |

Cloudflare 的 * 會匹配子目錄，先排除再檢查包含；因此不能排除 docs/* 後再嘗試包含架構頁。新增加會影響正式網站的頂層目錄時，也要更新後台規則。首次套用建議比較一次純 MD 推送與一次程式推送的建置紀錄；目前倉庫測試只驗證規則範例，不代表已修改雲端設定。

空變更推送，以及包含至少 3000 個檔案變更或 20 次提交的大型推送，Cloudflare 可能略過路徑判斷而建置。手動重試部署也應視為手動操作。詳見 [Cloudflare 官方 Build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/)。

## 架構頁網址

來源為 docs/architecture/index.html，樣式放在同目錄。Vite 輸出 dist/docs/architecture/index.html，此版本部署後可用 [架構導覽](https://bondageclub-lite.pages.dev/docs/architecture/) 開啟；舊 /docs/architecture.html 以 301 轉向新網址。GitHub 的 blob 連結仍是原始碼頁面。
