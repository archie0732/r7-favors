import { APP_CONFIG } from "../config.js";
import { GitHubContentsStore } from "./github-store.js";
import { ToolboxApp } from "./toolbox-app.js";
import { byId, clearSessionToken, errorMessage, isConfiguredSource, readSessionToken, setBusy, writeSessionToken } from "./utils.js";
import { showToast } from "./ui.js";
import { setupBackToTop } from "./back-to-top.js";

const source = APP_CONFIG.publicSource;
const configured = isConfiguredSource(source);
const store = new GitHubContentsStore(source);
const app = new ToolboxApp({
  source,
  store,
  config: APP_CONFIG,
  adminActions: [
    { label: "更換 Token", onClick: () => switchToken() },
    { label: "退出管理", onClick: () => exitAdmin({ toast: "已退出管理模式，Token 已從這個分頁清除。" }) }
  ]
});
const tokenDialog = byId("token-dialog");
const tokenForm = byId("token-form");
const tokenInput = byId("token-input");
const tokenError = byId("token-error");
const rememberToken = byId("remember-token");
const tokenDialogClose = byId("token-dialog-close");
const adminButton = byId("admin-button");
byId("public-repo-target").textContent = `${source.owner}/${source.repo}`;

// Public browsing uses the Pages-served copy from this Repository. Admin mode
// refreshes from the Contents API before allowing any write.
await app.load({ localFallback: "./data/tools.json" });

function openTokenDialog(message = "") {
  tokenError.textContent = message;
  if (!tokenDialog.open) tokenDialog.showModal();
  tokenInput.focus();
}

// 打錯或想換一組 Token 時的共同出口：把 Token 從記憶體與分頁暫存清掉，
// 再讀回 Pages 上的公開資料，畫面不會停在只有管理者看得到的版本。
async function exitAdmin({ toast = "" } = {}) {
  store.setToken("");
  clearSessionToken(source);
  app.setAdmin(false);
  adminButton.textContent = "管理";
  adminButton.classList.remove("is-active");
  await app.load({ localFallback: "./data/tools.json" });
  if (toast) showToast(toast);
}

async function switchToken() {
  await exitAdmin();
  openTokenDialog("");
}

async function unlockAdmin(token, remember, { silent = false } = {}) {
  store.setToken(token);
  const submit = tokenForm.querySelector('[type="submit"]');
  if (!silent) setBusy(submit, true, "驗證中…");
  try {
    await store.checkWriteAccess();
    const result = await store.loadData();
    app.data = result.data;
    app.sha = result.sha;
    app.setAdmin(true);
    app.render();
    adminButton.textContent = "管理中";
    adminButton.classList.add("is-active");
    if (remember) writeSessionToken(source, token);
    else clearSessionToken(source);
    tokenInput.value = "";
    tokenDialog.close();
    showToast("已進入管理模式。Token 不會寫入網站資料。");
    return true;
  } catch (error) {
    store.setToken("");
    clearSessionToken(source);
    if (!silent) tokenError.textContent = errorMessage(error);
    return false;
  } finally {
    if (!silent) setBusy(submit, false);
  }
}

adminButton.addEventListener("click", () => {
  if (app.admin) {
    byId("admin-bar")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!configured) {
    showToast("請先在 config.js 填入公開 Repository 設定，才能啟用管理模式。", "error");
    return;
  }
  openTokenDialog("");
});

document.querySelector("[data-open-admin]")?.addEventListener("click", () => {
  adminButton.click();
  if (app.admin) byId("admin-bar")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  tokenError.textContent = token ? "" : "請輸入 GitHub Token。";
  if (token) await unlockAdmin(token, rememberToken.checked);
});

tokenDialogClose.addEventListener("click", () => tokenDialog.close());
tokenDialog.addEventListener("close", () => {
  tokenInput.value = "";
  tokenError.textContent = "";
});

const savedToken = configured ? readSessionToken(source) : "";
if (savedToken && !(await unlockAdmin(savedToken, true, { silent: true }))) {
  showToast("先前暫存的 Token 已失效，請按「管理」重新輸入。", "error");
}

window.addEventListener("pagehide", () => app.dispose(), { once: true });

setupBackToTop();
