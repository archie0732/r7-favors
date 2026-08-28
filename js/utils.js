export const byId = (id) => document.getElementById(id);

export function isConfiguredSource(source) {
  if (!source) return false;
  return [source.owner, source.repo, source.branch, source.dataPath, source.thumbnailDirectory]
    .every((value) => typeof value === "string" && value.trim() && !value.startsWith("YOUR_"));
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
