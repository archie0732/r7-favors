export const byId = (id) => document.getElementById(id);

export function isConfiguredSource(source) {
  if (!source) return false;
  return [source.owner, source.repo, source.branch, source.dataPath, source.thumbnailDirectory]
    .every((value) => typeof value === "string" && value.trim() && !value.startsWith("YOUR_"));
}

const PRIVATE_REPO_STORAGE_KEY = "r7-favors:private-repo";
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

// Accepts "owner/repo", a github.com URL (with or without /tree/<branch>),
// or an SSH remote, so the private page never needs a config.js edit.
export function parseRepoInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^git\+/i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/^ssh:\/\/git@github\.com\//i, "")
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .split(/[?#]/)[0]
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo] = parts;
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) return null;
  const branch = parts[2] === "tree" && parts[3] ? parts.slice(3).join("/") : "";
  return { owner, repo, branch };
}

export function formatRepo(source) {
  return source ? `${source.owner}/${source.repo}` : "";
}

export function readSessionRepo() {
  try {
    return parseRepoInput(sessionStorage.getItem(PRIVATE_REPO_STORAGE_KEY) ?? "");
  } catch {
    return null;
  }
}

export function writeSessionRepo(source) {
  try {
    const branch = source.branch && source.branch !== "main" ? `/tree/${source.branch}` : "";
    sessionStorage.setItem(PRIVATE_REPO_STORAGE_KEY, `${formatRepo(source)}${branch}`);
  } catch {
    // Remembering the target is a convenience only.
  }
}

export function clearSessionRepo() {
  try {
    sessionStorage.removeItem(PRIVATE_REPO_STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}

export function errorMessage(error, fallback = "發生未預期的錯誤，請稍後再試。") {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function sessionTokenKey(source) {
  return `r7-favors:token:${source.owner}/${source.repo}`;
}

export function readSessionToken(source) {
  try {
    return sessionStorage.getItem(sessionTokenKey(source)) ?? "";
  } catch {
    return "";
  }
}

export function writeSessionToken(source, token) {
  try {
    sessionStorage.setItem(sessionTokenKey(source), token);
  } catch {
    // The app still works with the in-memory token when storage is unavailable.
  }
}

export function clearSessionToken(source) {
  try {
    sessionStorage.removeItem(sessionTokenKey(source));
  } catch {
    // Nothing else to clear.
  }
}

export function formatDate(isoString) {
  try {
    return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export function debounce(callback, delay = 160) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

export function setBusy(button, busy, busyLabel = "處理中…") {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}
