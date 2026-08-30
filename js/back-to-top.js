import { byId } from "./utils.js";

// 捲過大半個畫面才顯示按鈕，短頁面（例如尚未解鎖的私人頁）不會冒出來。
export function setupBackToTop() {
  const control = byId("back-to-top");
  if (!control) return;
  const sync = () => control.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.6);
  window.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync, { passive: true });
  control.addEventListener("click", () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    document.querySelector(".brand")?.focus({ preventScroll: true });
  });
  sync();
}
