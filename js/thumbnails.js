const MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
});

export function validateThumbnailFile(file, config) {
  if (!(file instanceof File)) throw new Error("請選擇圖片檔案。");
  if (!config.allowedThumbnailTypes.includes(file.type)) throw new Error("縮圖只接受 JPEG、PNG 或 WebP。 SVG 不允許上傳。 ");
  if (file.size <= 0) throw new Error("縮圖檔案是空的。");
  if (file.size > config.maxThumbnailBytes) {
    const sizeMb = (config.maxThumbnailBytes / 1024 / 1024).toFixed(1).replace(".0", "");
    throw new Error(`縮圖不可超過 ${sizeMb} MB。`);
  }
  return true;
}

export async function prepareThumbnailUpload(file, config, source) {
  validateThumbnailFile(file, config);
  const extension = MIME_EXTENSIONS[file.type];
  const directory = source.thumbnailDirectory.replace(/^\/+|\/+$/g, "");
  return {
    path: `${directory}/${crypto.randomUUID()}.${extension}`,
    bytes: new Uint8Array(await file.arrayBuffer())
  };
}

function rawGitHubUrl(source, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/${encodeURIComponent(source.branch)}/${encodedPath}`;
}

export class ThumbnailResolver {
  constructor({ source, store, privateMode = false }) {
    this.source = source;
    this.store = store;
    this.privateMode = privateMode;
    this.cache = new Map();
    this.objectUrls = new Set();
    this.defaultUrl = new URL("../assets/default-thumbnail.svg", import.meta.url).href;
  }

  async resolve(thumbnail) {
    if (!thumbnail || thumbnail.kind === "default") return this.defaultUrl;
    if (thumbnail.kind === "url") return thumbnail.value;
    if (!this.privateMode) return rawGitHubUrl(this.source, thumbnail.value);
    if (!this.cache.has(thumbnail.value)) {
      this.cache.set(thumbnail.value, this.store.readFile(thumbnail.value).then(({ bytes }) => {
        const url = URL.createObjectURL(new Blob([bytes]));
        this.objectUrls.add(url);
        return url;
      }));
    }
    return this.cache.get(thumbnail.value);
  }

  dispose() {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls.clear();
    this.cache.clear();
  }
}
