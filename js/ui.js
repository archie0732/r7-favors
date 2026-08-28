export function element(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);
  for (const [key, value] of Object.entries(options)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style") Object.entries(value).forEach(([property, propertyValue]) => {
      if (property.startsWith("--")) node.style.setProperty(property, propertyValue);
      else node.style[property] = propertyValue;
    });
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, String(value));
  }
  const childList = Array.isArray(children) ? children : [children];
  childList.filter((child) => child != null).forEach((child) => node.append(child));
  return node;
}

export function button(label, className = "button button-quiet", options = {}) {
  return element("button", { type: "button", className, ...options, text: label });
}

export function showToast(message, type = "success") {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const toast = element("div", { className: `toast${type === "error" ? " is-error" : ""}`, role: "status", text: message });
  region.append(toast);
  window.setTimeout(() => toast.remove(), type === "error" ? 6500 : 3600);
}

export function showStatus(container, message, { loading = false, action } = {}) {
  container.replaceChildren();
  container.hidden = false;
  if (loading) container.append(element("span", { className: "spinner", "aria-hidden": "true" }));
  container.append(element("p", { text: message }));
  if (action) container.append(button(action.label, "button button-quiet", { onclick: action.handler }));
}

export function openDialog(dialog) {
  document.getElementById("modal-root")?.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
}

export function formField(labelText, control, hint = "") {
  const children = [element("span", { text: labelText }), control];
  if (hint) children.push(element("small", { className: "form-hint", text: hint }));
  return element("label", { className: "form-field" }, children);
}

export function closeButton() {
  return button("×", "icon-button dialog-close", { "aria-label": "關閉", onclick: (event) => event.currentTarget.closest("dialog")?.close() });
}
