import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();

test("client code never uses persistent credential stores", async () => {
  const files = ["js/utils.js", "js/public-page.js", "js/private-page.js", "js/github-store.js"];
  const source = (await Promise.all(files.map((file) => readFile(join(root, file), "utf8")))).join("\n");
  assert.doesNotMatch(source, /localStorage|document\.cookie/);
});

test("private page does not embed or import private JSON", async () => {
  const html = await readFile(join(root, "private.html"), "utf8");
  assert.doesNotMatch(html, /private-links\.json|<script[^>]*type=["']application\/json/);
  assert.match(html, /private-token-form/);
});

test("locking the private page clears rendered private data", async () => {
  const privateController = await readFile(join(root, "js/private-page.js"), "utf8");
  assert.match(privateController, /function lock\(\)[\s\S]*app\.clearDataView\(\)/);
});

test("config contains no GitHub token-like value", async () => {
  const config = await readFile(join(root, "config.js"), "utf8");
  assert.doesNotMatch(config, /github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+/);
});
