import test from "node:test";
import assert from "node:assert/strict";
import { GitHubContentsStore } from "../js/github-store.js";

const source = { owner: "owner", repo: "repo", branch: "main", dataPath: "data/tools.json", thumbnailDirectory: "assets/thumbnails" };
const now = "2026-08-28T12:00:00.000Z";
const data = { version: 1, updatedAt: now, types: [], tags: [], items: [] };

function asBase64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

test("loads UTF-8 JSON through the Contents API", async () => {
  const mockFetch = async (url, options) => {
    assert.match(url, /\/contents\/data\/tools\.json\?ref=main$/);
    assert.equal(options.headers.get("Authorization"), "Bearer secret-value");
    return new Response(JSON.stringify({ type: "file", sha: "abc", content: asBase64(JSON.stringify(data)) }), { status: 200 });
  };
  const store = new GitHubContentsStore(source, "secret-value", mockFetch);
  const result = await store.loadData();
  assert.equal(result.sha, "abc");
  assert.deepEqual(result.data, data);
});

test("writes normalized JSON with branch and SHA", async () => {
  const mockFetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(options.method, "PUT");
    assert.equal(body.branch, "main");
    assert.equal(body.sha, "old-sha");
    assert.deepEqual(JSON.parse(Buffer.from(body.content, "base64").toString("utf8")), data);
    return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 200 });
  };
  const store = new GitHubContentsStore(source, "token", mockFetch);
  const result = await store.saveData(data, "old-sha");
  assert.equal(result.sha, "new-sha");
});

test("turns conflicts into an understandable error", async () => {
  const mockFetch = async () => new Response(JSON.stringify({ message: "sha does not match" }), { status: 409 });
  const store = new GitHubContentsStore(source, "token", mockFetch);
  await assert.rejects(store.saveData(data, "stale"), /重新載入/);
});
