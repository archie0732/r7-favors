import test from "node:test";
import assert from "node:assert/strict";
import { createStarterData, DataValidationError, normalizeToolboxData, upsertItem } from "../js/data-model.js";

const now = "2026-08-28T12:00:00.000Z";

function validData() {
  return {
    version: 1,
    updatedAt: now,
    types: [{ id: "web-tool", name: "網頁工具", color: "#3B82F6" }],
    tags: [{ id: "ai", name: "AI" }],
    items: [{
      id: "example-id",
      title: "  範例工具  ",
      url: "https://example.com",
      description: " 說明 ",
      thumbnail: { kind: "default", value: "" },
      typeId: "web-tool",
      tagIds: ["ai"],
      favorite: false,
      createdAt: now,
      updatedAt: now
    }]
  };
}

test("loads and normalizes valid toolbox data", () => {
  const result = normalizeToolboxData(validData());
  assert.equal(result.items[0].title, "範例工具");
  assert.equal(result.items[0].url, "https://example.com/");
  assert.equal(result.types[0].color, "#3b82f6");
});

test("rejects unsafe item URLs", () => {
  const data = validData();
  data.items[0].url = "javascript:alert(1)";
  assert.throws(() => normalizeToolboxData(data), DataValidationError);
});

test("rejects taxonomy names that only differ in case", () => {
  const data = validData();
  data.tags.push({ id: "ai-2", name: "ai" });
  assert.throws(() => normalizeToolboxData(data), /名稱忽略大小寫後不可重複/);
});

test("rejects missing type and tag references", () => {
  const data = validData();
  data.items[0].typeId = "missing";
  data.items[0].tagIds = ["missing"];
  assert.throws(() => normalizeToolboxData(data), /找不到對應類型/);
});

test("upsert preserves createdAt and updates editable fields", () => {
  const data = normalizeToolboxData(validData());
  const result = upsertItem(data, { ...data.items[0], title: "新標題" });
  assert.equal(result.items[0].title, "新標題");
  assert.equal(result.items[0].createdAt, now);
});

test("starter data contains useful defaults without private items", () => {
  const starter = createStarterData();
  assert.equal(starter.version, 1);
  assert.equal(starter.types.length, 3);
  assert.equal(starter.tags.length, 3);
  assert.deepEqual(starter.items, []);
  assert.doesNotThrow(() => normalizeToolboxData(starter));
});
