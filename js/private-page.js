import { APP_CONFIG } from "../config.js";
import { GitHubContentsStore } from "./github-store.js";
import { createStarterData } from "./data-model.js";
import { ToolboxApp } from "./toolbox-app.js";
import {
  byId,
  clearSessionRepo,
  clearSessionToken,
  errorMessage,
  formatRepo,
  isConfiguredSource,
  parseRepoInput,
  readSessionRepo,
  readSessionToken,
  setBusy,
  writeSessionRepo,
  writeSessionToken
} from "./utils.js";
import { showToast } from "./ui.js";
import { setupBackToTop } from "./back-to-top.js";

// The target Repository is chosen in the browser. `source` stays a single
// mutable object because the store, the app and the thumbnail resolver all
// hold a reference to it.
const source = { ...APP_CONFIG.privateSource };
const store = new GitHubContentsStore(source);
const app = new ToolboxApp({ source, store, config: APP_CONFIG, privateMode: true });
const gate = byId("private-gate");
const content = byId("private-content");
const form = byId("private-token-form");
const repoInput = byId("private-repo-input");
const input = byId("private-token-input");
const remember = byId("private-remember-token");
const errorElement = byId("private-token-error");
const lockButton = byId("lock-button");
const initializer = byId("private-initializer");
const collection = byId("private-collection");
const initializeButton = byId("initialize-private-data");
const initializerError = byId("initializer-error");
const repoTarget = byId("private-repo-target");
const dataPathTarget = byId("private-data-path");

function renderTarget() {
  const configured = isConfiguredSource(source);
  repoTarget.textContent = configured ? `${formatRepo(source)}（${source.branch}）` : "尚未指定";
  dataPathTarget.textContent = configured ? `${formatRepo(source)}/${source.dataPath}` : "尚未指定";
}

function applyRepo(target) {
  source.owner = target.owner;
  source.repo = target.repo;
  source.branch = target.branch || APP_CONFIG.privateSource.branch || "main";
  renderTarget();
}

function syncAddressBar() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("repo", formatRepo(source));
    window.history.replaceState(null, "", url);
  } catch {
    // A non-updatable URL never blocks unlocking.
  }
}

function repoFromQuery() {
  try {
    return parseRepoInput(new URLSearchParams(window.location.search).get("repo") ?? "");
  } catch {
    return null;
  }
}

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
  repoInput.value = formatRepo(source);
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
    syncAddressBar();
    if (rememberToken) {
      writeSessionToken(source, token);
      writeSessionRepo(source);
    } else {
      clearSessionToken(source);
      clearSessionRepo();
    }
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
  const target = parseRepoInput(repoInput.value);
  if (!target) {
    errorElement.textContent = "請輸入 owner/repo，或貼上 GitHub Repository 連結。";
    repoInput.focus();
    return;
  }
  applyRepo(target);
  const token = input.value.trim();
  errorElement.textContent = token ? "" : "請輸入 GitHub Token。";
  if (token) await unlock(token, remember.checked);
});

repoInput.addEventListener("change", () => {
  const target = parseRepoInput(repoInput.value);
  if (target) {
    applyRepo(target);
    errorElement.textContent = "";
  }
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

const initialRepo = repoFromQuery() || readSessionRepo() || (isConfiguredSource(APP_CONFIG.privateSource) ? APP_CONFIG.privateSource : null);
if (initialRepo) applyRepo(initialRepo);
else renderTarget();
repoInput.value = initialRepo ? formatRepo(source) : "";

if (initialRepo) {
  const savedToken = readSessionToken(source);
  if (savedToken && !(await unlock(savedToken, true, { silent: true }))) {
    errorElement.textContent = "先前的分頁 Token 已失效，請重新輸入。";
  }
}

window.addEventListener("pagehide", () => app.dispose(), { once: true });

setupBackToTop();
