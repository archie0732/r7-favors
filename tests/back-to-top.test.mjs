import test from "node:test";
import assert from "node:assert/strict";

// 用最小的 DOM 替身跑捲動邏輯，不需要瀏覽器。
function stubDom({ innerHeight = 800 } = {}) {
  const listeners = new Map();
  const control = {
    classes: new Set(),
    classList: {
      toggle(name, force) { if (force) control.classes.add(name); else control.classes.delete(name); }
    },
    addEventListener(type, handler) { listeners.set(`control:${type}`, handler); }
  };
  const brand = { focused: false, focus() { brand.focused = true; } };
  globalThis.document = {
    getElementById: (id) => (id === "back-to-top" ? control : null),
    querySelector: (selector) => (selector === ".brand" ? brand : null)
  };
  globalThis.window = {
    innerHeight,
    scrollY: 0,
    scrolledTo: null,
    addEventListener(type, handler) { listeners.set(`window:${type}`, handler); },
    matchMedia: () => ({ matches: false }),
    scrollTo(options) { window.scrolledTo = options; }
  };
  return { control, brand, fire: (key) => listeners.get(key)?.() };
}

test("the back-to-top control appears only after scrolling past most of a screen", async () => {
  const { control, fire } = stubDom();
  const { setupBackToTop } = await import(`../js/back-to-top.js?case=visibility`);
  setupBackToTop();
  assert.equal(control.classes.has("is-visible"), false);
  window.scrollY = 400;
  fire("window:scroll");
  assert.equal(control.classes.has("is-visible"), false);
  window.scrollY = 700;
  fire("window:scroll");
  assert.equal(control.classes.has("is-visible"), true);
});

test("clicking the control returns to the top and moves focus with it", async () => {
  const { brand, fire } = stubDom();
  const { setupBackToTop } = await import(`../js/back-to-top.js?case=click`);
  setupBackToTop();
  fire("control:click");
  assert.deepEqual(window.scrolledTo, { top: 0, behavior: "smooth" });
  assert.equal(brand.focused, true);
});

test("setup stays quiet on pages without the control", async () => {
  stubDom();
  globalThis.document.getElementById = () => null;
  const { setupBackToTop } = await import(`../js/back-to-top.js?case=missing`);
  assert.doesNotThrow(() => setupBackToTop());
});
