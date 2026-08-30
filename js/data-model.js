const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const VALID_THUMBNAIL_KINDS = new Set(["default", "url", "github"]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const TAXONOMY_ID = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,63}$/u;

export class DataValidationError extends Error {
  constructor(issues) {
    super(`資料格式有誤：${issues.slice(0, 4).join("；")}${issues.length > 4 ? `（另有 ${issues.length - 4} 項）` : ""}`);
    this.name = "DataValidationError";
    this.issues = issues;
  }
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(value) {
  return cleanText(value).normalize("NFKC").toLocaleLowerCase();
}

function validIso(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeIso(value) {
  return new Date(value).toISOString();
}

function normalizeUrl(value, label, issues) {
  const text = cleanText(value);
  try {
    const url = new URL(text);
    if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("bad protocol");
    return url.href;
  } catch {
    issues.push(`${label}只允許 http:// 或 https:// 網址`);
    return text;
  }
}

function normalizeTaxonomy(entries, kind, issues) {
  if (!Array.isArray(entries)) {
    issues.push(`${kind}必須是陣列`);
    return [];
  }
  const seenIds = new Set();
  const seenNames = new Set();
  return entries.map((entry, index) => {
    const path = `${kind}[${index}]`;
    const id = cleanText(entry?.id);
    const name = cleanText(entry?.name);
    if (!TAXONOMY_ID.test(id)) issues.push(`${path}.id 格式不正確`);
    if (seenIds.has(id)) issues.push(`${path}.id 不可重複`);
    seenIds.add(id);
    if (!name || name.length > 60) issues.push(`${path}.name 長度必須是 1–60`);
    const comparableName = normalizeName(name);
    if (seenNames.has(comparableName)) issues.push(`${kind}名稱忽略大小寫後不可重複：${name}`);
    seenNames.add(comparableName);
    if (kind === "types") {
      const color = cleanText(entry?.color);
      if (!HEX_COLOR.test(color)) issues.push(`${path}.color 必須是六位數色碼`);
      return { id, name, color: color.toLowerCase() };
    }
    return { id, name };
  });
}

function normalizeThumbnail(thumbnail, path, issues) {
  const kind = cleanText(thumbnail?.kind);
  const value = cleanText(thumbnail?.value);
  if (!VALID_THUMBNAIL_KINDS.has(kind)) issues.push(`${path}.kind 只能是 default、url 或 github`);
  if (kind === "default" && value) issues.push(`${path}.value 在 default 模式必須為空字串`);
  if (kind === "url") {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:") throw new Error("not https");
    } catch {
      issues.push(`${path}.value 必須是 https:// 圖片網址`);
    }
  }
  if (kind === "github" && (!value || value.startsWith("/") || value.includes("..") || value.includes("\\"))) {
    issues.push(`${path}.value 必須是 Repository 內的安全相對路徑`);
  }
  return { kind, value };
}

export function normalizeToolboxData(raw) {
  const issues = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new DataValidationError(["根節點必須是物件"]);
  if (raw.version !== 1) issues.push("version 必須是 1");
  if (!validIso(raw.updatedAt)) issues.push("updatedAt 必須是有效的 ISO 8601 時間");
  const types = normalizeTaxonomy(raw.types, "types", issues);
  // 標籤分類是後來才加的，舊資料檔沒有這個欄位時視為「全部未分類」。
  const tagGroups = normalizeTaxonomy(raw.tagGroups ?? [], "tagGroups", issues);
  const groupIds = new Set(tagGroups.map(({ id }) => id));
  const tags = normalizeTaxonomy(raw.tags, "tags", issues).map((tag, index) => {
    const groupId = cleanText(raw.tags?.[index]?.groupId);
    if (groupId && !groupIds.has(groupId)) issues.push(`tags[${index}].groupId 找不到對應標籤分類：${groupId}`);
    return { ...tag, groupId: groupIds.has(groupId) ? groupId : "" };
  });
  const typeIds = new Set(types.map(({ id }) => id));
  const tagIds = new Set(tags.map(({ id }) => id));
  const seenItemIds = new Set();
  const items = Array.isArray(raw.items) ? raw.items.map((item, index) => {
    const path = `items[${index}]`;
    const id = cleanText(item?.id);
    const title = cleanText(item?.title);
    const description = cleanText(item?.description);
    const typeId = cleanText(item?.typeId);
    const itemTagIds = Array.isArray(item?.tagIds) ? [...new Set(item.tagIds.map(cleanText))] : [];
    if (!id || id.length > 100) issues.push(`${path}.id 必填且不可超過 100 字`);
    if (seenItemIds.has(id)) issues.push(`${path}.id 不可重複`);
    seenItemIds.add(id);
    if (!title || title.length > MAX_TITLE_LENGTH) issues.push(`${path}.title 長度必須是 1–${MAX_TITLE_LENGTH}`);
    const url = normalizeUrl(item?.url, `${path}.url`, issues);
    if (description.length > MAX_DESCRIPTION_LENGTH) issues.push(`${path}.description 不可超過 ${MAX_DESCRIPTION_LENGTH} 字`);
    if (!typeIds.has(typeId)) issues.push(`${path}.typeId 找不到對應類型`);
    if (!Array.isArray(item?.tagIds)) issues.push(`${path}.tagIds 必須是陣列`);
    if (Array.isArray(item?.tagIds) && itemTagIds.length !== item.tagIds.length) issues.push(`${path}.tagIds 不可重複`);
    itemTagIds.forEach((tagId) => { if (!tagIds.has(tagId)) issues.push(`${path}.tagIds 包含不存在的標籤：${tagId}`); });
    if (typeof item?.favorite !== "boolean") issues.push(`${path}.favorite 必須是布林值`);
    // 「稍後再看」是後來才加的欄位，舊資料沒有這個鍵時當作 false，只有填了錯型別才報錯。
    if (item?.watchLater !== undefined && typeof item.watchLater !== "boolean") issues.push(`${path}.watchLater 必須是布林值`);
    if (!validIso(item?.createdAt)) issues.push(`${path}.createdAt 必須是有效時間`);
    if (!validIso(item?.updatedAt)) issues.push(`${path}.updatedAt 必須是有效時間`);
    return {
      id,
      title,
      url,
      description,
      thumbnail: normalizeThumbnail(item?.thumbnail, `${path}.thumbnail`, issues),
      typeId,
      tagIds: itemTagIds,
      favorite: item?.favorite === true,
      watchLater: item?.watchLater === true,
      createdAt: validIso(item?.createdAt) ? normalizeIso(item.createdAt) : cleanText(item?.createdAt),
      updatedAt: validIso(item?.updatedAt) ? normalizeIso(item.updatedAt) : cleanText(item?.updatedAt)
    };
  }) : (issues.push("items 必須是陣列"), []);
  if (issues.length) throw new DataValidationError(issues);
  return {
    version: 1,
    updatedAt: normalizeIso(raw.updatedAt),
    types,
    tagGroups,
    tags,
    items
  };
}

// 依標籤分類把標籤排好；沒有分類的標籤集中在最後一組，方便篩選列與編輯器共用同一份順序。
export function groupedTags(data, { includeEmpty = false, ungroupedName = "未分類" } = {}) {
  const groups = (data.tagGroups ?? []).map((group) => ({ group, tags: [] }));
  const byId = new Map(groups.map((entry) => [entry.group.id, entry]));
  const ungrouped = { group: { id: "", name: ungroupedName }, tags: [] };
  for (const tag of data.tags) (byId.get(tag.groupId) ?? ungrouped).tags.push(tag);
  return [...groups, ungrouped].filter((entry) => includeEmpty || entry.tags.length);
}

export function createEmptyData() {
  const now = new Date().toISOString();
  return { version: 1, updatedAt: now, types: [], tagGroups: [], tags: [], items: [] };
}

export function createStarterData() {
  const now = new Date().toISOString();
  return normalizeToolboxData({
    version: 1,
    updatedAt: now,
    types: [
      { id: "web-tool", name: "網頁工具", color: "#2f6f68" },
      { id: "reference", name: "參考資料", color: "#8568a6" },
      { id: "video", name: "影片", color: "#e0523f" }
    ],
    tagGroups: [],
    tags: [
      { id: "important", name: "重要" },
      { id: "work", name: "工作" },
      { id: "read-later", name: "稍後閱讀" }
    ],
    items: []
  });
}

export function validateItemDraft(draft, data) {
  const now = new Date().toISOString();
  const synthetic = {
    version: 1,
    updatedAt: now,
    types: data.types,
    tagGroups: data.tagGroups ?? [],
    tags: data.tags,
    items: [{
      id: draft.id || crypto.randomUUID(),
      title: draft.title,
      url: draft.url,
      description: draft.description || "",
      thumbnail: draft.thumbnail || { kind: "default", value: "" },
      typeId: draft.typeId,
      tagIds: draft.tagIds || [],
      favorite: draft.favorite === true,
      watchLater: draft.watchLater === true,
      createdAt: draft.createdAt || now,
      updatedAt: now
    }]
  };
  return normalizeToolboxData(synthetic).items[0];
}

export function upsertItem(data, draft) {
  const existing = draft.id ? data.items.find((item) => item.id === draft.id) : null;
  const item = validateItemDraft({ ...draft, createdAt: existing?.createdAt }, data);
  const items = existing
    ? data.items.map((entry) => entry.id === item.id ? item : entry)
    : [item, ...data.items];
  return normalizeToolboxData({ ...data, updatedAt: new Date().toISOString(), items });
}

export function removeItem(data, id) {
  return normalizeToolboxData({ ...data, updatedAt: new Date().toISOString(), items: data.items.filter((item) => item.id !== id) });
}

export function assertUniqueTaxonomyName(entries, name, excludeId = "") {
  const comparable = normalizeName(name);
  if (!comparable) throw new DataValidationError(["名稱不可空白"]);
  if (entries.some((entry) => entry.id !== excludeId && normalizeName(entry.name) === comparable)) {
    throw new DataValidationError([`名稱「${cleanText(name)}」已存在`]);
  }
}

export function createTaxonomyId(name, entries) {
  const base = cleanText(name).normalize("NFKD").toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "group";
  const ids = new Set(entries.map((entry) => entry.id));
  if (!ids.has(base)) return base;
  let candidate;
  do candidate = `${base}-${crypto.randomUUID().slice(0, 6)}`; while (ids.has(candidate));
  return candidate;
}

export const DATA_LIMITS = Object.freeze({ title: MAX_TITLE_LENGTH, description: MAX_DESCRIPTION_LENGTH });
