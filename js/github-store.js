import { createEmptyData, normalizeToolboxData } from "./data-model.js";

const API_VERSION = "2022-11-28";

export class GitHubApiError extends Error {
  constructor(message, status, code = "github_error") {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.code = code;
  }
}

function encodePath(path) {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function friendlyGitHubError(status, message, remaining) {
  if (status === 401) return "Token 無效或已過期，請重新輸入。";
  if (status === 403 && remaining === "0") return "GitHub API 使用額度已達上限，請稍後再試。";
  if (status === 403) return "Token 沒有此 Repository 的必要權限。";
  if (status === 404) return "找不到 Repository 或資料檔；若為私人 Repository，請確認 Token 已授權。";
  if (status === 409) return "資料已被其他工作階段更新。請重新載入後再儲存。";
  if (status === 422) return `GitHub 拒絕這次更新：${message || "請檢查檔案內容與路徑。"}`;
  return `GitHub API 回應錯誤（${status}）。${message || "請稍後再試。"}`;
}

export class GitHubContentsStore {
  constructor(source, token = "", fetchImpl = globalThis.fetch) {
    this.source = source;
    this.token = token.trim();
    this.fetchImpl = fetchImpl;
  }

  setToken(token) {
    this.token = token.trim();
  }

  apiUrl(path = "") {
    const base = `https://api.github.com/repos/${encodeURIComponent(this.source.owner)}/${encodeURIComponent(this.source.repo)}`;
    return path ? `${base}/contents/${encodePath(path)}` : base;
  }

  async request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/vnd.github+json");
    headers.set("X-GitHub-Api-Version", API_VERSION);
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    let response;
    try {
      response = await this.fetchImpl(url, { ...options, headers, referrerPolicy: "no-referrer" });
    } catch {
      throw new GitHubApiError("無法連線 GitHub。請檢查網路後再試。", 0, "network_error");
    }
    const text = response.status === 204 ? "" : await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!response.ok) {
      const message = friendlyGitHubError(response.status, payload?.message, response.headers.get("x-ratelimit-remaining"));
      throw new GitHubApiError(message, response.status, response.status === 409 ? "conflict" : "github_error");
    }
    return payload;
  }

  async checkWriteAccess() {
    if (!this.token) throw new GitHubApiError("請先提供 GitHub Token。", 401, "missing_token");
    const access = await this.getAccess();
    if (!access.canWrite) {
      throw new GitHubApiError("此 Token 沒有 Repository Contents 寫入權限。", 403, "read_only");
    }
    return true;
  }

  async getAccess() {
    if (!this.token) throw new GitHubApiError("請先提供 GitHub Token。", 401, "missing_token");
    const repository = await this.request(this.apiUrl());
    const permissions = repository?.permissions;
    return {
      canRead: true,
      canWrite: !permissions || Boolean(permissions.push || permissions.maintain || permissions.admin)
    };
  }

  async readFile(path, { allowMissing = false } = {}) {
    try {
      const payload = await this.request(`${this.apiUrl(path)}?ref=${encodeURIComponent(this.source.branch)}`);
      if (!payload || payload.type !== "file" || typeof payload.content !== "string") {
        throw new GitHubApiError("GitHub 回傳的檔案格式不正確。", 500, "invalid_response");
      }
      return { bytes: base64ToBytes(payload.content), sha: payload.sha, downloadUrl: payload.download_url };
    } catch (error) {
      if (allowMissing && error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
  }

  async loadData({ allowMissing = false } = {}) {
    const file = await this.readFile(this.source.dataPath, { allowMissing });
    if (!file) return { data: createEmptyData(), sha: "", exists: false };
    let raw;
    try {
      raw = JSON.parse(new TextDecoder().decode(file.bytes));
    } catch {
      throw new GitHubApiError("資料檔不是有效的 UTF-8 JSON。", 422, "invalid_json");
    }
    return { data: normalizeToolboxData(raw), sha: file.sha, exists: true };
  }

  async saveData(data, sha, message = "Update toolbox data") {
    const normalized = normalizeToolboxData(data);
    const bytes = new TextEncoder().encode(`${JSON.stringify(normalized, null, 2)}\n`);
    const body = { message, content: bytesToBase64(bytes), branch: this.source.branch };
    if (sha) body.sha = sha;
    const payload = await this.request(this.apiUrl(this.source.dataPath), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { data: normalized, sha: payload?.content?.sha || "", exists: true };
  }

  async uploadBytes(path, bytes, message = "Upload toolbox thumbnail") {
    const payload = await this.request(this.apiUrl(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: bytesToBase64(bytes), branch: this.source.branch })
    });
    return payload?.content?.sha || "";
  }

  async deleteFile(path, message = "Delete toolbox thumbnail") {
    const file = await this.readFile(path, { allowMissing: true });
    if (!file) return false;
    await this.request(this.apiUrl(path), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sha: file.sha, branch: this.source.branch })
    });
    return true;
  }
}

export const base64Helpers = Object.freeze({ bytesToBase64, base64ToBytes });
