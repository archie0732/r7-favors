import { normalizeToolboxData, upsertItem, removeItem, createTaxonomyId, groupedTags, DATA_LIMITS } from "./data-model.js";
import { filterItems } from "./search.js";
import { prepareThumbnailUpload, ThumbnailResolver } from "./thumbnails.js";
import { byId, debounce, errorMessage, formatDate, setBusy } from "./utils.js";
import { button, closeButton, element, formField, openDialog, showStatus, showToast } from "./ui.js";

export class ToolboxApp {
  constructor({ source, store, config, privateMode = false }) {
    this.source = source;
    this.store = store;
    this.config = config;
    this.privateMode = privateMode;
    this.data = null;
    this.sha = "";
    this.admin = privateMode;
    this.filters = { query: "", typeId: "", tagId: "", favorite: false };
    this.status = byId("status-panel");
    this.grid = byId("card-grid");
    this.count = byId("visible-count");
    this.typeFilter = byId("type-filter");
    this.tagFilters = byId("tag-filters");
    this.searchInput = byId("search-input");
    this.favoriteFilter = byId("favorites-filter");
    this.renderSequence = 0;
    this.resolver = new ThumbnailResolver({ source, store, privateMode });
    this.bindFilters();
  }

  bindFilters() {
    this.searchInput?.addEventListener("input", debounce(() => {
      this.filters.query = this.searchInput.value;
      this.renderItems();
    }));
    this.typeFilter?.addEventListener("change", () => {
      this.filters.typeId = this.typeFilter.value;
      this.renderItems();
    });
    this.favoriteFilter?.addEventListener("change", () => {
      this.filters.favorite = this.favoriteFilter.checked;
      this.renderItems();
    });
    byId("clear-filters")?.addEventListener("click", () => {
      this.filters = { query: "", typeId: "", tagId: "", favorite: false };
      this.searchInput.value = "";
      this.typeFilter.value = "";
      this.favoriteFilter.checked = false;
      this.renderFilterOptions();
      this.renderItems();
    });
  }

  async load({ localFallback = "" } = {}) {
    showStatus(this.status, "正在整理工具箱…", { loading: true });
    this.grid.hidden = true;
    try {
      if (localFallback) {
        const response = await fetch(localFallback, { cache: "no-store" });
        if (!response.ok) throw new Error("無法讀取公開資料檔。");
        this.data = normalizeToolboxData(await response.json());
        this.sha = "";
      } else {
        const result = await this.store.loadData({ allowMissing: this.admin });
        this.data = result.data;
        this.sha = result.sha;
      }
      this.render();
      return true;
    } catch (error) {
      showStatus(this.status, errorMessage(error), { action: { label: "重試", handler: () => this.load({ localFallback }) } });
      this.count.textContent = "0";
      return false;
    }
  }

  setAdmin(enabled) {
    this.admin = enabled;
    document.body.classList.toggle("is-admin", enabled);
    if (enabled) this.renderAdminBar();
    else byId("admin-bar")?.remove();
    if (this.data) this.renderItems();
  }

  render() {
    this.renderFilterOptions();
    this.renderItems();
    if (this.admin) this.renderAdminBar();
  }

  renderAdminBar() {
    let bar = byId("admin-bar");
    if (!bar) {
      bar = element("div", { className: "admin-bar", id: "admin-bar" }, [
        element("span", { className: "admin-indicator", text: "管理模式" }),
        element("div", { className: "admin-actions" }, [
          button("新增項目", "button button-primary", { onclick: () => this.openItemEditor() }),
          button("類型與標籤", "button button-quiet", { onclick: () => this.openTaxonomyEditor() }),
          button("重新載入", "button button-quiet", { onclick: () => this.reloadFromGitHub() })
        ])
      ]);
      document.querySelector(".tool-surface")?.prepend(bar);
    }
  }

  async reloadFromGitHub() {
    if (!this.store.token) return;
    await this.load();
    showToast("已載入 GitHub 上的最新資料。");
  }

  renderFilterOptions() {
    if (!this.data) return;
    const currentType = this.filters.typeId;
    this.typeFilter.replaceChildren(element("option", { value: "", text: "所有類型" }));
    this.data.types.forEach((type) => this.typeFilter.append(element("option", { value: type.id, text: type.name })));
    this.typeFilter.value = this.data.types.some(({ id }) => id === currentType) ? currentType : "";
    this.filters.typeId = this.typeFilter.value;
    this.renderTagFilters();
  }

  renderTagFilters() {
    const counts = new Map();
    this.data.items.forEach((item) => item.tagIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));
    const groups = groupedTags(this.data, { ungroupedName: "其它標籤" });
    this.tagFilters.replaceChildren(...groups.map(({ group, tags }) => element("div", { className: "tag-group" }, [
      element("span", { className: "tag-group-label", text: group.name }),
      element("div", { className: "tag-group-chips" }, tags.map((tag) => {
        const chip = button(`#${tag.name}`, "tag-chip", {
          "aria-pressed": this.filters.tagId === tag.id ? "true" : "false",
          onclick: () => {
            this.filters.tagId = this.filters.tagId === tag.id ? "" : tag.id;
            this.renderTagFilters();
            this.renderItems();
          }
        });
        chip.append(element("span", { className: "tag-count", text: String(counts.get(tag.id) ?? 0) }));
        return chip;
      }))
    ])));
    this.tagFilters.hidden = !groups.length;
  }

  async renderItems() {
    if (!this.data) return;
    const sequence = ++this.renderSequence;
    const typeMap = new Map(this.data.types.map((type) => [type.id, type]));
    const tagMap = new Map(this.data.tags.map((tag) => [tag.id, tag]));
    const items = filterItems(this.data, this.filters);
    this.count.textContent = String(items.length);
    this.grid.replaceChildren();
    this.status.hidden = true;
    this.grid.hidden = false;
    if (!items.length) {
      this.grid.hidden = true;
      showStatus(this.status, this.data.items.length ? "找不到符合目前條件的項目。" : "工具箱還是空的。進入管理模式新增第一筆收藏吧。", this.admin ? { action: { label: "新增項目", handler: () => this.openItemEditor() } } : {});
      return;
    }
    for (const item of items) {
      const card = this.createCard(item, typeMap.get(item.typeId), item.tagIds.map((id) => tagMap.get(id)).filter(Boolean));
      this.grid.append(card);
      try {
        const imageUrl = await this.resolver.resolve(item.thumbnail);
        if (sequence !== this.renderSequence || !card.isConnected) continue;
        card.querySelector("img").src = imageUrl;
      } catch {
        if (sequence === this.renderSequence && card.isConnected) card.querySelector("img").src = this.resolver.defaultUrl;
      }
    }
  }

  createCard(item, type, tags) {
    const image = element("img", { className: "card-thumbnail", alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
    image.addEventListener("error", () => { if (image.src !== this.resolver.defaultUrl) image.src = this.resolver.defaultUrl; }, { once: true });
    const meta = element("div", { className: "card-meta" }, [
      element("span", { className: "type-label", text: type?.name ?? "未分類", style: { "--type-color": type?.color ?? "#68716c" } }),
      element("span", { className: "favorite-mark", title: item.favorite ? "已收藏" : "", text: item.favorite ? "★" : "" })
    ]);
    const link = element("a", { href: item.url, target: "_blank", rel: "noopener noreferrer", referrerpolicy: "no-referrer", text: item.title });
    const description = element("p", { text: item.description || "沒有附加說明。" });
    const tagLine = element("div", { className: "card-tags" }, tags.map((tag) => element("span", { text: `#${tag.name}` })));
    const footer = element("div", { className: "card-footer" }, [element("span", { text: `更新於 ${formatDate(item.updatedAt)}` }), element("span", { text: "↗" })]);
    const body = element("div", { className: "card-body" }, [meta, element("h2", {}, link), description, tagLine, footer]);
    const card = element("article", { className: "tool-card" }, [image, body]);
    if (this.admin) {
      card.append(element("div", { className: "card-admin" }, [
        button("編輯", "mini-button", { onclick: () => this.openItemEditor(item) }),
        button("刪除", "mini-button mini-button-danger", { onclick: () => this.deleteItem(item) })
      ]));
    }
    return card;
  }

  openItemEditor(item = null) {
    if (!this.data.types.length) {
      showToast("請先建立至少一個類型。", "error");
      this.openTaxonomyEditor();
      return;
    }
    const dialog = element("dialog", { className: "dialog dialog-wide", "aria-label": item ? "編輯項目" : "新增項目" });
    const form = element("form", { className: "dialog-card", novalidate: true });
    const titleInput = element("input", { name: "title", maxlength: DATA_LIMITS.title, required: true, value: item?.title || "" });
    const urlInput = element("input", { name: "url", type: "url", required: true, value: item?.url || "", placeholder: "https://…" });
    const descriptionInput = element("textarea", { name: "description", maxlength: DATA_LIMITS.description, rows: 4 });
    descriptionInput.value = item?.description || "";
    const typeSelect = element("select", { name: "typeId", required: true }, this.data.types.map((type) => element("option", { value: type.id, text: type.name })));
    typeSelect.value = item?.typeId || this.data.types[0].id;
    const favoriteInput = element("input", { name: "favorite", type: "checkbox" });
    favoriteInput.checked = item?.favorite === true;
    const tags = element("div", { className: "choice-groups" }, groupedTags(this.data, { ungroupedName: "其它標籤" }).map(({ group, tags: groupTags }) =>
      element("div", { className: "choice-group" }, [
        element("span", { className: "tag-group-label", text: group.name }),
        element("div", { className: "choice-grid" }, groupTags.map((tag) => {
          const input = element("input", { type: "checkbox", name: "tagIds", value: tag.id });
          input.checked = item?.tagIds.includes(tag.id) ?? false;
          return element("label", { className: "choice-chip" }, [input, element("span", { text: tag.name })]);
        }))
      ])
    ));
    const thumbnailMode = element("select", { name: "thumbnailMode" }, [
      element("option", { value: "default", text: "使用預設縮圖" }),
      element("option", { value: "url", text: "外部 HTTPS 圖片網址" }),
      element("option", { value: "github", text: "上傳到 GitHub Repository" })
    ]);
    thumbnailMode.value = item?.thumbnail.kind || "default";
    const thumbnailUrl = element("input", { name: "thumbnailUrl", type: "url", placeholder: "https://…", value: item?.thumbnail.kind === "url" ? item.thumbnail.value : "" });
    const thumbnailFile = element("input", { name: "thumbnailFile", type: "file", accept: this.config.allowedThumbnailTypes.join(",") });
    const urlField = formField("圖片網址", thumbnailUrl, "只接受 HTTPS 圖片網址；來源網站可能限制外部載入。");
    const fileField = formField("上傳圖片", thumbnailFile, `JPEG、PNG 或 WebP，最多 ${Math.round(this.config.maxThumbnailBytes / 1024 / 1024)} MB。${item?.thumbnail.kind === "github" ? "未選新檔案會保留原圖。" : ""}`);
    const toggleThumbnailFields = () => {
      urlField.hidden = thumbnailMode.value !== "url";
      fileField.hidden = thumbnailMode.value !== "github";
    };
    thumbnailMode.addEventListener("change", toggleThumbnailFields);
    const error = element("p", { className: "form-error", role: "alert" });
    const submit = button(item ? "儲存變更" : "新增項目", "button button-primary", { type: "submit" });
    form.append(
      closeButton(),
      element("p", { className: "eyebrow", text: item ? "EDIT FAVOR" : "NEW FAVOR" }),
      element("h2", { text: item ? "編輯收藏" : "新增收藏" }),
      element("div", { className: "form-grid" }, [formField("標題", titleInput), formField("網址", urlInput)]),
      formField("說明", descriptionInput, `${DATA_LIMITS.description} 字以內`),
      element("div", { className: "form-grid" }, [formField("類型", typeSelect), element("label", { className: "checkbox-field favorite-field" }, [favoriteInput, element("span", { text: "標示為收藏" })])]),
      element("fieldset", { className: "form-fieldset" }, [element("legend", { text: "標籤（可複選）" }), tags]),
      formField("縮圖來源", thumbnailMode), urlField, fileField, error,
      element("div", { className: "dialog-actions" }, [button("取消", "button button-quiet", { onclick: () => dialog.close() }), submit])
    );
    toggleThumbnailFields();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      setBusy(submit, true, "儲存中…");
      let upload = null;
      let uploadedPath = "";
      try {
        const mode = thumbnailMode.value;
        if (mode === "github" && thumbnailFile.files[0]) upload = await prepareThumbnailUpload(thumbnailFile.files[0], this.config, this.source);
        let thumbnail;
        if (mode === "default") thumbnail = { kind: "default", value: "" };
        else if (mode === "url") thumbnail = { kind: "url", value: thumbnailUrl.value };
        else if (upload) thumbnail = { kind: "github", value: upload.path };
        else if (item?.thumbnail.kind === "github") thumbnail = item.thumbnail;
        else throw new Error("請選擇要上傳的縮圖檔案。");
        const draft = {
          id: item?.id,
          title: titleInput.value,
          url: urlInput.value,
          description: descriptionInput.value,
          typeId: typeSelect.value,
          tagIds: [...tags.querySelectorAll("input:checked")].map((input) => input.value),
          favorite: favoriteInput.checked,
          thumbnail
        };
        const nextData = upsertItem(this.data, draft);
        if (upload) {
          await this.store.uploadBytes(upload.path, upload.bytes, `Upload thumbnail for ${nextData.items.find((entry) => entry.id === (item?.id || nextData.items[0].id))?.title || "toolbox item"}`);
          uploadedPath = upload.path;
        }
        const result = await this.store.saveData(nextData, this.sha, item ? `Update ${draft.title.trim()}` : `Add ${draft.title.trim()}`);
        const oldPath = item?.thumbnail.kind === "github" ? item.thumbnail.value : "";
        this.data = result.data;
        this.sha = result.sha;
        this.resetResolver();
        dialog.close();
        this.render();
        showToast(item ? "項目已更新並提交到 GitHub。" : "項目已新增並提交到 GitHub。");
        if (oldPath && oldPath !== uploadedPath && oldPath !== thumbnail.value) this.store.deleteFile(oldPath).catch(() => {});
      } catch (caught) {
        if (uploadedPath) await this.store.deleteFile(uploadedPath).catch(() => {});
        error.textContent = errorMessage(caught);
      } finally {
        setBusy(submit, false);
      }
    });
    dialog.append(form);
    openDialog(dialog);
    titleInput.focus();
  }

  async deleteItem(item) {
    if (!window.confirm(`確定刪除「${item.title}」？這會提交一次 GitHub 變更。`)) return;
    try {
      const result = await this.store.saveData(removeItem(this.data, item.id), this.sha, `Delete ${item.title}`);
      this.data = result.data;
      this.sha = result.sha;
      this.resetResolver();
      this.render();
      showToast("項目已從 GitHub 資料檔刪除。");
      if (item.thumbnail.kind === "github") this.store.deleteFile(item.thumbnail.value).catch(() => {});
    } catch (error) {
      showToast(errorMessage(error), "error");
    }
  }

  openTaxonomyEditor() {
    let working = structuredClone(this.data);
    const dialog = element("dialog", { className: "dialog dialog-wide", "aria-label": "類型與標籤" });
    const form = element("form", { className: "dialog-card" });
    const typeList = element("div", { className: "taxonomy-list" });
    const groupList = element("div", { className: "taxonomy-list" });
    const tagList = element("div", { className: "taxonomy-list" });
    const error = element("p", { className: "form-error", role: "alert" });
    const renderLists = () => {
      typeList.replaceChildren(...working.types.map((type) => this.taxonomyRow(type, "type", working, renderLists, error)));
      groupList.replaceChildren(...working.tagGroups.map((group) => this.taxonomyRow(group, "tagGroup", working, renderLists, error)));
      tagList.replaceChildren(...working.tags.map((tag) => this.taxonomyRow(tag, "tag", working, renderLists, error)));
    };
    const addType = button("＋ 新增類型", "button button-quiet", { onclick: () => {
      const name = `新類型 ${working.types.length + 1}`;
      working.types.push({ id: createTaxonomyId(name, working.types), name, color: "#2f6f68" });
      renderLists();
    }});
    const addGroup = button("＋ 新增標籤分類", "button button-quiet", { onclick: () => {
      const name = `新分類 ${working.tagGroups.length + 1}`;
      working.tagGroups.push({ id: createTaxonomyId(name, working.tagGroups), name });
      renderLists();
    }});
    const addTag = button("＋ 新增標籤", "button button-quiet", { onclick: () => {
      const name = `新標籤 ${working.tags.length + 1}`;
      working.tags.push({ id: createTaxonomyId(name, working.tags), name, groupId: working.tagGroups[0]?.id ?? "" });
      renderLists();
    }});
    const submit = button("儲存分類設定", "button button-primary", { type: "submit" });
    form.append(
      closeButton(), element("p", { className: "eyebrow", text: "ORGANIZE" }), element("h2", { text: "類型與標籤" }),
      element("p", { className: "dialog-copy", text: "類型用於單選分類；標籤可套用多個，並可歸到「系列」「角色」這類標籤分類下，讓篩選列分區顯示。名稱忽略大小寫後不可重複。" }),
      element("section", { className: "taxonomy-section" }, [element("div", { className: "section-heading" }, [element("h3", { text: "類型" }), addType]), typeList]),
      element("section", { className: "taxonomy-section" }, [element("div", { className: "section-heading" }, [element("h3", { text: "標籤分類" }), addGroup]), groupList]),
      element("section", { className: "taxonomy-section" }, [element("div", { className: "section-heading" }, [element("h3", { text: "標籤" }), addTag]), tagList]),
      error, element("div", { className: "dialog-actions" }, [button("取消", "button button-quiet", { onclick: () => dialog.close() }), submit])
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      setBusy(submit, true, "儲存中…");
      try {
        const nextData = normalizeToolboxData({ ...working, updatedAt: new Date().toISOString() });
        const result = await this.store.saveData(nextData, this.sha, "Update toolbox types and tags");
        this.data = result.data;
        this.sha = result.sha;
        dialog.close();
        this.render();
        showToast("類型與標籤已儲存到 GitHub。");
      } catch (caught) {
        error.textContent = errorMessage(caught);
      } finally {
        setBusy(submit, false);
      }
    });
    renderLists();
    dialog.append(form);
    openDialog(dialog);
  }

  taxonomyRow(entry, kind, working, rerender, error) {
    const label = { type: "類型", tagGroup: "標籤分類", tag: "標籤" }[kind];
    const input = element("input", { type: "text", maxlength: 60, value: entry.name, "aria-label": `${label}名稱` });
    input.addEventListener("input", () => { entry.name = input.value; });
    const children = [input];
    if (kind === "type") {
      const color = element("input", { type: "color", value: entry.color, "aria-label": `${entry.name} 顏色` });
      color.addEventListener("input", () => { entry.color = color.value; });
      children.push(color);
    }
    if (kind === "tag") {
      const group = element("select", { "aria-label": `${entry.name} 所屬分類` }, [
        element("option", { value: "", text: "未分類" }),
        ...working.tagGroups.map(({ id, name }) => element("option", { value: id, text: name }))
      ]);
      group.value = entry.groupId ?? "";
      group.addEventListener("change", () => { entry.groupId = group.value; });
      children.push(group);
    }
    children.push(button("刪除", "mini-button mini-button-danger", { onclick: () => {
      error.textContent = "";
      if (kind === "type" && working.items.some((item) => item.typeId === entry.id)) {
        error.textContent = `類型「${entry.name}」仍有項目使用，請先調整項目後再刪除。`;
        return;
      }
      // 刪掉分類只是把底下的標籤退回「未分類」，標籤與項目都保留。
      if (kind === "tagGroup") working.tags.forEach((tag) => { if (tag.groupId === entry.id) tag.groupId = ""; });
      if (kind === "tag") working.items.forEach((item) => { item.tagIds = item.tagIds.filter((id) => id !== entry.id); });
      const collection = { type: working.types, tagGroup: working.tagGroups, tag: working.tags }[kind];
      collection.splice(collection.findIndex(({ id }) => id === entry.id), 1);
      rerender();
    }}));
    return element("div", { className: `taxonomy-row taxonomy-row-${kind}` }, children);
  }

  resetResolver() {
    this.resolver.dispose();
    this.resolver = new ThumbnailResolver({ source: this.source, store: this.store, privateMode: this.privateMode });
  }

  clearDataView() {
    this.renderSequence += 1;
    this.data = null;
    this.sha = "";
    this.filters = { query: "", typeId: "", tagId: "", favorite: false };
    this.grid?.replaceChildren();
    if (this.grid) this.grid.hidden = true;
    this.status?.replaceChildren();
    if (this.status) this.status.hidden = true;
    this.tagFilters?.replaceChildren();
    this.typeFilter?.replaceChildren(element("option", { value: "", text: "所有類型" }));
    if (this.searchInput) this.searchInput.value = "";
    if (this.favoriteFilter) this.favoriteFilter.checked = false;
    if (this.count) this.count.textContent = "—";
    this.resetResolver();
  }

  dispose() {
    this.resolver.dispose();
  }
}
