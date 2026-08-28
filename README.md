# R7 Favors 個人工具箱

一個可直接部署到 GitHub Pages 的雙頁個人工具箱。網站只使用 HTML、CSS 與原生 JavaScript ES Modules，不需要前端框架、後端、資料庫或建置流程。

- `index.html`：公開工具箱。訪客直接讀取此 Repository 由 GitHub Pages 提供的 `data/tools.json`；管理者驗證 Token 後，改由 GitHub Contents API 取得最新 SHA 並提交變更。
- `private.html`：私人連結庫。未驗證前不會要求或顯示私人資料；解鎖後才使用 Token 呼叫另一個 Private Repository 的 Contents API。
- 新增、修改、刪除項目，管理類型與標籤，搜尋／篩選／收藏排序，以及縮圖 URL 或 Repository 上傳。
- JSON 載入時會完整驗證與正規化；寫入帶有 SHA，避免靜默覆蓋同時發生的修改。

## 1. 設定公開與私人 Repository

編輯 [`config.js`](./config.js)。公開 Repository 已設定為本專案：

```js
publicSource: {
  owner: "archie0732",
  repo: "r7-favors",
  branch: "main",
  dataPath: "data/tools.json",
  thumbnailDirectory: "assets/thumbnails"
}
```

請把 `privateSource` 的預留值改成你建立的私人資料 Repository。Repository 名稱與路徑不是密鑰，可以出現在公開設定；Token 絕對不可放入 `config.js`。

私人 Repository 建議結構：

```text
private-toolbox-data/
├─ data/
│  └─ private-links.json
└─ assets/
   └─ thumbnails/
```

可把 `data/tools.json` 複製為初始 `data/private-links.json`，再清除 `items`。**不要**把真正的私人 JSON、私人縮圖或其副本加入本公開 Repository。

若私人資料檔尚未建立，具寫入權限的管理者仍可解鎖，先建立類型／標籤，再儲存第一筆資料；網站會透過 Contents API 建立 JSON 檔。

## 2. 建立最小權限 Token

在 GitHub 建立 Fine-grained personal access token：

1. Repository access 只選需要管理的公開或私人 Repository。
2. Repository permissions → Contents：瀏覽只需 `Read-only`；新增、修改、刪除與上傳縮圖需 `Read and write`。
3. 設定合理的到期日，並定期輪替。

網站不接受 GitHub 帳號密碼。Token 只存在 JavaScript 記憶體；使用者主動勾選「在此分頁期間暫存」時才會放入 `sessionStorage`。它不會進入 `localStorage`、Cookie、網址、JSON、console log 或 Git commit。按「鎖定」會立即從記憶體與 `sessionStorage` 清除私人頁 Token。

如果同一個 Token 需要管理兩個 Repository，請只授權這兩個 Repository；更嚴格的作法是為公開與私人資料各建一個 Token。

## 3. GitHub Pages 部署

本專案不需要 build：

1. 將檔案推送到預設 branch。
2. 到 Repository **Settings → Pages**。
3. Source 選 **Deploy from a branch**，Branch 選 `main` 與 `/ (root)`。
4. 等待 GitHub Pages 完成部署。

`.nojekyll` 已包含在根目錄。管理者透過 Contents API 提交公開 JSON 後，GitHub Pages 可能需要短暫時間才會更新訪客讀到的靜態檔；管理模式會立即顯示 API 回傳的新資料。

如果 Repository 啟用了嚴格的 Content Security Policy，請保留對 `https://api.github.com` 與 `https://raw.githubusercontent.com` 的連線／圖片權限。

## 4. 本機開發與測試

瀏覽器 ES Modules 不能可靠地直接由 `file://` 開啟，請使用任一靜態伺服器。例如專案已附一個零相依伺服器：

```powershell
node tests/dev-server.mjs 4173
```

然後開啟 `http://127.0.0.1:4173/`。自動測試只需要 Node.js 20 或更新版本，不會安裝任何套件：

```powershell
npm test
```

測試涵蓋資料正規化與錯誤拒絕、搜尋組合、Contents API UTF-8／SHA 寫入、衝突訊息，以及私人頁與 Token 儲存安全檢查。

## 資料與縮圖規則

JSON schema 範例在 [`data/tools.json`](./data/tools.json)。主要限制：

- 項目 ID 由 `crypto.randomUUID()` 產生。
- 標題去除頭尾空白後 1–120 字；說明最多 500 字。
- 連結只允許 `http:` 與 `https:`；外部縮圖只允許 `https:`。
- 每筆項目必須引用有效類型；標籤不可重複且必須存在。
- Type／Tag 名稱以 Unicode NFKC 正規化並忽略大小寫後不可重複。
- 上傳縮圖只接受 JPEG、PNG、WebP，預設上限 2 MB；檔名使用 UUID。
- 所有時間以 ISO 8601 UTC 儲存。

上傳新縮圖時，網站先上傳圖片再提交 JSON；若 JSON 提交失敗會盡力清理剛上傳的檔案。刪除或替換舊縮圖時則先成功提交 JSON，再清理不再引用的圖片，避免資料指向不存在的檔案。

## 安全邊界

這是純前端 GitHub Pages 應用，無法替公開頁提供伺服器端登入。安全性來自 GitHub 本身對 Token 與 Repository 的授權：

- 公開 JSON 與縮圖本來就可被所有訪客取得。
- 私人資料只存在 Private Repository，且只在使用者提供有效 Token 後由瀏覽器取得。
- 私人頁 HTML、JavaScript bundle 與公開 Repository 都不包含私人資料。
- DOM 內容全部用 `textContent`／屬性 API 建立，不把 Repository 文字插入 `innerHTML`。
- 外部連結使用 `noopener noreferrer` 與 `no-referrer`。
- Token 仍會存在已解鎖分頁的記憶體中；不要在不信任的裝置或瀏覽器擴充套件環境輸入 Token。

## 瀏覽器支援

目標為最新穩定版 Chrome、Edge、Firefox 與 Safari。需要支援 `crypto.randomUUID()`、`<dialog>`、ES Modules、`fetch`、`structuredClone()` 與 `:has()` 的現代瀏覽器。
