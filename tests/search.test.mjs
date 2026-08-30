import test from "node:test";
import assert from "node:assert/strict";
import { filterItems } from "../js/search.js";

const data = {
  tags: [{ id: "ai", name: "AI" }, { id: "design", name: "設計" }],
  items: [
    { id: "1", title: "設計助手", description: "產生配色", url: "https://a.example", typeId: "tool", tagIds: ["ai", "design"], favorite: true, updatedAt: "2026-08-28T12:00:00.000Z" },
    { id: "2", title: "文件庫", description: "規格參考", url: "https://b.example", typeId: "reference", tagIds: [], favorite: false, updatedAt: "2026-08-29T12:00:00.000Z" },
    { id: "3", title: "教學影片", description: "之後再看", url: "https://c.example", typeId: "video", tagIds: [], favorite: false, watchLater: true, updatedAt: "2026-08-20T12:00:00.000Z" }
  ]
};

test("searches title, description and tag names", () => {
  assert.deepEqual(filterItems(data, { query: "ai 配色" }).map(({ id }) => id), ["1"]);
});

test("combines type, tag and favorite filters", () => {
  assert.deepEqual(filterItems(data, { typeId: "tool", tagId: "design", favorite: true }).map(({ id }) => id), ["1"]);
  assert.equal(filterItems(data, { typeId: "reference", favorite: true }).length, 0);
});

test("favorites sort before recently updated items", () => {
  assert.deepEqual(filterItems(data, { typeId: "" }).map(({ id }) => id).slice(1), ["1", "2"]);
});

test("watch-later items pin above favorites", () => {
  assert.deepEqual(filterItems(data).map(({ id }) => id), ["3", "1", "2"]);
});

test("filters down to watch-later items only", () => {
  assert.deepEqual(filterItems(data, { watchLater: true }).map(({ id }) => id), ["3"]);
  assert.equal(filterItems(data, { watchLater: true, favorite: true }).length, 0);
});
