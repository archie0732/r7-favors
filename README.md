# R7 Favors：建立自己的 GitHub 工具庫

R7 Favors 是一個不需要後端、資料庫或前端框架的個人工具收藏庫。Fork 後即可用 GitHub Pages 免費發布；公開資料放在網站 Repository，私人資料則放在另一個 Private Repository，只有輸入 GitHub Token 後才會載入。

網站提供：

- 公開工具箱與真正不預載資料的私人連結庫。
- 搜尋、類型／標籤篩選與最愛排序。
- 從頁面新增、修改、刪除連結及管理類型與標籤。
- 預設縮圖、外部 HTTPS 圖片與 Repository 圖片上傳。
- 私人資料檔不存在時，一鍵建立安全的預設 JSON。
- GitHub SHA 衝突保護，避免覆蓋另一個工作階段的修改。

## 架構與安全邊界

```text
你的公開 Fork（GitHub Pages）
├─ HTML / CSS / JavaScript
├─ config.js                    # Repository 名稱與路徑，沒有 Token
├─ data/tools.json              # 公開收藏
└─ assets/thumbnails/           # 公開縮圖

你的 Private Repository
├─ data/private-links.json      # 私人收藏
└─ assets/thumbnails/           # 私人縮圖
```

公開 Repository 中的所有檔案都能被任何人讀取，所以私人 JSON 和私人縮圖絕對不能放進公開 Fork。私人頁在 Token 驗證前不會向 Private Repository 發出資料請求，也不會把私人資料打包在網站內。

## 第一步：Fork 這個專案

1. 登入 GitHub，開啟 [R7 Favors Repository](https://github.com/archie0732/r7-favors)。
2. 按右上角 **Fork**，或直接開啟 [Fork 頁面](https://github.com/archie0732/r7-favors/fork)。
3. Owner 選自己的帳號，Repository name 可保留 `r7-favors` 或改成喜歡的名稱。
4. 建立 Fork，並保持它為 **Public**，這樣 GitHub Free 才能使用 GitHub Pages。

Fork 會保留原專案的 commit 歷史。若你希望建立完全獨立、沒有上游關係的新專案，也可以下載程式後建立新的 Public Repository。

## 第二步：設定 `config.js`

在自己的 Fork 開啟 [`config.js`](./config.js)，按鉛筆圖示編輯：

```js
export const APP_CONFIG = Object.freeze({
  publicSource: {
    owner: "你的 GitHub 帳號",
    repo: "你的公開 Fork 名稱",
    branch: "main",
    dataPath: "data/tools.json",
    thumbnailDirectory: "assets/thumbnails"
  },
  privateSource: {
    owner: "你的 GitHub 帳號",
    repo: "你的 Private Repository 名稱",
    branch: "main",
    dataPath: "data/private-links.json",
    thumbnailDirectory: "assets/thumbnails"
  },
  maxThumbnailBytes: 2 * 1024 * 1024,
  allowedThumbnailTypes: ["image/jpeg", "image/png", "image/webp"]
});
```

Repository 名稱與資料路徑不是密鑰，可以放在公開設定。**絕對不要把 GitHub Token 寫進 `config.js`。**

## 第三步：建立私人資料 Repository

若不需要私人連結庫，可以先保留 `privateSource` 的預留值。需要時：

1. 在 GitHub 右上角按 **＋ → New repository**。
2. 例如命名為 `private-toolbox-data`。
3. Visibility 選 **Private**。
4. 勾選 **Add a README file**，讓 Repository 先建立 `main` branch。
5. 建立 Repository。名稱不必寫進 `config.js`：私人頁的解鎖表單可以直接貼上 Repository 連結。

私人頁的 **私人 Repository** 欄位接受下列任一格式：

- `owner/private-toolbox-data`
- `https://github.com/owner/private-toolbox-data`
- `https://github.com/owner/private-toolbox-data/tree/<branch>`（同時指定 branch）

勾選「在此分頁期間暫存」會連同 Repository 一起記在該分頁；解鎖成功後網址會補上 `?repo=owner/repo`，可直接加入書籤。`config.js` 的 `privateSource` 仍可保留，作為預設值。

網站不會建立 Private Repository 本身。它只會依你輸入（或 `config.js` 預設）的 `owner`、`repo`、`branch` 與 `dataPath` 存取已存在且已授權的 Repository。

不必手動建立 `data/private-links.json`。首次開啟私人頁、輸入具寫入權限的 Token 後，按 **建立預設 JSON**，網站會在 `privateSource.dataPath` 指定的位置建立：

- 三個預設類型：網頁工具、參考資料、影片。
- 三個預設標籤：重要、工作、稍後閱讀。
- 空的 `items` 陣列，不含任何範例私人資料。

## 第四步：建立最小權限 GitHub Token

建議使用 [Fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)，不要使用 GitHub 密碼或 SSH public key，也不要優先使用 classic token。

建立時：

1. **Token name**：例如 `R7 Favors`。
2. **Expiration**：選合理的到期日，之後定期輪替。
3. **Resource owner**：選你的帳號。
4. **Repository access**：選 **Only select repositories**。
5. 只勾選你的公開 Fork 與 `private-toolbox-data`。
6. **Repository permissions → Contents**：
   - 只瀏覽私人資料：`Read-only`。
   - 新增、修改、刪除資料或上傳縮圖：`Read and write`。
7. 其他權限保持預設；Metadata 的 Read 權限會由 GitHub 自動提供。

同一個 Token 可以授權兩個指定 Repository；若想要更嚴格，可為公開與私人資料分別建立 Token。GitHub 官方也建議使用 Fine-grained token、最小權限與最短合理期限。

Token 的保存規則：

- 預設只存在目前頁面的 JavaScript 記憶體。
- 勾選「在此分頁期間暫存」才會寫入 `sessionStorage`，關閉分頁後清除。
- 不會寫入 `localStorage`、Cookie、網址、JSON、console log 或 Git commit。
- 私人頁按 **鎖定** 會清除 Token、記憶體資料及已渲染的私人內容。

## 第五步：發布 GitHub Pages

1. 到 Fork 的 **Settings → Actions → General**。
2. 在 Actions permissions 選 **Allow all actions and reusable workflows**，按 Save。
3. 到 **Settings → Pages**。
4. Source 選 **Deploy from a branch**。
5. Branch 選 `main`，Folder 選 `/(root)`，按 Save。
6. 到 Repository 的 **Actions** 等待 `pages build and deployment` 完成。

完成後網址通常是：

```text
https://你的帳號.github.io/你的-Repository-名稱/
```

本專案已有 `.nojekyll`，不需要 npm build 或 Jekyll。Pages 使用公開 Repository 時可搭配 GitHub Free；即使來源 Repository 是私人且方案允許 Pages，發布出的網站仍可能是公開的，因此私人資料仍應放在獨立 Private Repository。

## 第六步：從頁面新增連結

### 公開工具箱

1. 開啟 GitHub Pages 網站。
2. 在公開工具箱右上角按 **管理**。
3. 輸入已授權公開 Fork、Contents 為 Read and write 的 Token。
4. 按 **新增項目**。
5. 填入標題、`http://` 或 `https://` 網址、說明與類型。
6. 視需要選擇標籤、最愛與縮圖來源。
7. 儲存後，網站會透過 GitHub Contents API 更新 `data/tools.json`。

### 私人連結庫

1. 開啟網站的 `private.html`。
2. 輸入已授權 Private Repository 的 Token。
3. 若資料檔尚不存在，按 **建立預設 JSON**。
4. 建立完成後按 **新增項目**，操作方式與公開工具箱相同。
5. 使用完畢按右上角 **鎖定**。

公開資料更新後，管理模式會立即顯示 API 回傳的內容；一般訪客由 GitHub Pages 讀取靜態 `data/tools.json`，可能需要等待 Pages 完成下一次部署與快取更新。

## 類型、標籤與縮圖

- 每筆項目必須選擇一個類型，可選零到多個標籤。
- Type／Tag 名稱經 Unicode NFKC 正規化並忽略大小寫後不可重複。
- 外部縮圖網址只允許 `https:`。
- 上傳縮圖只接受 JPEG、PNG、WebP，預設最多 2 MB。
- Repository 縮圖使用 UUID 檔名，避免覆蓋同名檔案。
- 所有時間以 ISO 8601 UTC 儲存。

## 更新 Fork

Fork 與原專案保持關聯。若 GitHub 顯示 **Sync fork**，同步前先確認不會覆蓋你在 `config.js`、`data/tools.json` 與介面上的自訂內容；建議先建立備份 branch，或透過 Pull Request 檢視差異。

## 本機開發與測試

瀏覽器 ES Modules 需要由 HTTP 開啟。專案附有零相依的本機伺服器：

```powershell
node tests/dev-server.mjs 4173
```

瀏覽 `http://127.0.0.1:4173/`。測試需要 Node.js 20 以上，不會安裝第三方套件：

```powershell
npm test
```

## 常見問題

### Pages 設定完成，但網址仍是 404

- 確認 Actions permissions 不是 Disable actions。
- 確認 Pages 使用 `main` 與 `/(root)`。
- 確認 Actions 出現 `pages build and deployment`。
- 若設定早於 Actions 啟用，可推送一個新 commit 重新觸發。

### Token 顯示沒有權限

- 確認 Token 尚未過期。
- 確認 Only select repositories 包含正確 Repository。
- 瀏覽至少需要 Contents Read-only；編輯需要 Contents Read and write。
- Organization 擁有的 Repository 可能要求管理員核准 Token。

### 私人資料檔無法建立

- 確認私人 Repository 已用 README 建立 `main` branch。
- 確認 `config.js` 的 owner、repo、branch 與 dataPath 正確。
- 確認 Token 對該 Repository 有 Contents Read and write。

## 官方參考

- [GitHub：建立與管理 Fine-grained personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [GitHub：API Token 最小權限與安全建議](https://docs.github.com/en/rest/authentication/keeping-your-api-credentials-secure)
- [GitHub：設定 Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub：建立 Fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo)

## License

[MIT](./LICENSE)
