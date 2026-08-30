import { APP_CONFIG } from "../config.js";
import { GitHubContentsStore } from "./github-store.js";
import { createStarterData } from "./data-model.js";
import { ToolboxApp } from "./toolbox-app.js";
import { byId, clearSessionToken, errorMessage, isConfiguredSource, readSessionToken, setBusy, writeSessionToken } from "./utils.js";
import { showToast } from "./ui.js";

const source = APP_CONFIG.privateSource;
const configured = isConfiguredSource(source);
const store = new GitHubContentsStore(source);
const app = new ToolboxApp({ source, store, config: APP_CONFIG, privateMode: true });
const gate = byId("private-gate");
const content = byId("private-content");
const form = byId("private-token-form");
const input = byId("private-token-input");
const remember = byId("private-remember-token");
const errorElement = byId("private-token-error");
const lockButton = byId("lock-button");
const initializer = byId("private-initializer");
const collection = byId("private-collection");
const initializeButton = byId("initialize-private-data");
const initializerError = byId("initializer-error");
byId("private-data-path").textContent = `${source.owner}/${source.repo}/${source.dataPath}`;

function lock() {
  app.setAdmin(false);
  app.clearDataView();
  store.setToken("");
  clearSessionToken(source);
  content.hidden = true;
  initializer.hidden = true;
  collection.hidden = true;
  initializerError.textContent = "";
  gate.hidden = false;
  lockButton.hidden = true;
  input.value = "";
  document.title = "私人連結庫 — R7 Favors";
}

async function unlock(token, rememberToken, { silent = false } = {}) {
  const submit = form.querySelector('[type="submit"]');
  store.setToken(token);
  if (!silent) setBusy(submit, true, "驗證中…");
  errorElement.textContent = "";
  try {
    const access = await store.getAccess();
    const result = await store.loadData({ allowMissing: access.canWrite });
    app.data = result.data;
    app.sha = result.sha;
    app.setAdmin(access.canWrite);
    gate.hidden = true;
    content.hidden = false;
    initializer.hidden = result.exists;
    collection.hidden = !result.exists;
    lockButton.hidden = false;
    document.title = "我的私人連結 — R7 Favors";
    if (result.exists) app.render();
    if (rememberToken) writeSessionToken(source, token);
    else clearSessionToken(source);
    input.value = "";
    if (!access.canWrite) showToast("已用唯讀權限載入。若要編輯，請使用具 Contents 寫入權限的 Token。", "error");
    return true;
  } catch (error) {
    store.setToken("");
    clearSessionToken(source);
    if (!silent) errorElement.textContent = errorMessage(error);
    return false;
  } finally {
    if (!silent) setBusy(submit, false);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!configured) {
    errorElement.textContent = "請先在 config.js 設定私人資料 Repository。";
    return;
  }
  const token = input.value.trim();
  errorElement.textContent = token ? "" : "請輸入 GitHub Token。";
  if (token) await unlock(token, remember.checked);
});

lockButton.addEventListener("click", lock);

initializeButton.addEventListener("click", async () => {
  initializerError.textContent = "";
  setBusy(initializeButton, true, "建立中…");
  try {
    const latest = await store.loadData({ allowMissing: true });
    const result = latest.exists
      ? latest
      : await store.saveData(createStarterData(), "", "Initialize private toolbox data");
    app.data = result.data;
    app.sha = result.sha;
    initializer.hidden = true;
    collection.hidden = false;
    app.render();
    showToast(latest.exists ? "資料檔已存在，已載入最新內容。" : "預設 JSON 已建立在 Private Repository。");
  } catch (error) {
    initializerError.textContent = errorMessage(error);
  } finally {
    setBusy(initializeButton, false);
  }
});

if (!configured) {
  errorElement.textContent = "尚未設定私人資料 Repository；請先編輯 config.js。";
} else {
  const savedToken = readSessionToken(source);
  if (savedToken && !(await unlock(savedToken, true, { silent: true }))) {
    errorElement.textContent = "先前的分頁 Token 已失效，請重新輸入。";
  }
}

window.addEventListener("pagehide", () => app.dispose(), { once: true });
