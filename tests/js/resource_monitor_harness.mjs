import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "web/js/deno_resource_monitor.js");
const source = fs.readFileSync(scriptPath, "utf8").replace(/^import .*;\r?\n/gm, "");
const MODE = "DENO.ResourceMonitor.Mode";
const CLEANUP = "DENO.ResourceMonitor.CleanupMode";
const PLACEMENT = "DENO.ResourceMonitor.Placement";
const POSITION = "DENO.ResourceMonitor.FloatingPosition.v1";
const ROOT = "deno-resource-monitor-root";
const sample = {
  cpu_percent: 25, ram_percent: 50, ram_used: 8 * 1024 ** 3, ram_total: 16 * 1024 ** 3,
  gpus: [{ index: 0, name: "Fixture GPU", gpu_percent: 40, vram_percent: 25,
    vram_used: 2 * 1024 ** 3, vram_total: 8 * 1024 ** 3, temperature: 55 }],
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function flush() {
  for (let turn = 0; turn < 30; turn += 1) await Promise.resolve();
}

// Deliberately small DOM fixture: no rendering claims are made by this harness.
// It exercises actual extension code, browser event ordering and owned DOM only.
function makeHarness({ crystools = "absent", cleanup = "absent", settings = {}, metrics = sample,
  storage = new Map(), storageBlocked = false } = {}) {
  let viewportWidth = 1440;
  let viewportHeight = 900;
  const pointerCaptures = new Map();
  const activePointers = new Set();
  const storageWrites = [];
  const observers = new Set();
  let observerScheduled = false;
  function notify(record) {
    for (const observer of observers) {
      if (observer.targets.some(({ target, options }) =>
        (record.target === target || (options.subtree && target.contains(record.target))) &&
        options[record.type] &&
        (record.type !== "attributes" || !options.attributeFilter || options.attributeFilter.includes(record.attributeName)))) {
        observer.records.push(record);
      }
    }
    if (observerScheduled) return;
    observerScheduled = true;
    queueMicrotask(() => {
      observerScheduled = false;
      for (const observer of observers) {
        const records = observer.records.splice(0);
        if (records.length) observer.callback(records, observer);
      }
    });
  }
  class EventTarget {
    listeners = new Map();
    addEventListener(type, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(callback);
    }
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
    dispatchEvent(event) {
      event.target ??= this;
      event.currentTarget = this;
      event.preventDefault ??= () => { event.defaultPrevented = true; };
      event.stopPropagation ??= () => { event.propagationStopped = true; };
      event.stopImmediatePropagation ??= () => { event.propagationStopped = true; event.immediatePropagationStopped = true; };
      for (const callback of [...(this.listeners.get(event.type) || [])]) {
        callback(event);
        if (event.immediatePropagationStopped) break;
      }
      if (event.bubbles && !event.propagationStopped) {
        const parent = this.parentElement || (this === document?.documentElement ? document : this === document ? windowEvents : null);
        parent?.dispatchEvent(event);
      }
      return !event.defaultPrevented;
    }
  }
  function matchesSimple(element, selector) {
    if (!selector) return false;
    let remaining = selector.trim();
    const nots = [...remaining.matchAll(/:not\(([^)]+)\)/g)].map((item) => item[1]);
    remaining = remaining.replace(/:not\([^)]+\)/g, "");
    if (nots.some((item) => matchesSimple(element, item))) return false;
    const attributes = [...remaining.matchAll(/\[([^\]=\s]+)(?:\s*=\s*["']?([^\]"']*)["']?)?\]/g)];
    for (const [, name, value] of attributes) {
      if (!element.hasAttribute(name) || (value !== undefined && element.getAttribute(name) !== value)) return false;
    }
    remaining = remaining.replace(/\[[^\]]+\]/g, "");
    for (const [, id] of remaining.matchAll(/#([\w-]+)/g)) if (element.id !== id) return false;
    for (const [, cls] of remaining.matchAll(/\.([\w-]+)/g)) if (!element.classList.contains(cls)) return false;
    remaining = remaining.replace(/[.#][\w-]+/g, "");
    return !remaining || remaining === "*" || remaining.toLowerCase() === element.tagName.toLowerCase();
  }
  function matches(element, selector) {
    return selector.split(",").some((part) => {
      // Split descendants only outside attribute values (which may contain spaces).
      const terms = part.trim().replace(/\s*([>+~])\s*/g, " $1 ").split(/\s+(?![^\[]*\])/);
      if (!matchesSimple(element, terms.pop())) return false;
      let candidate = element;
      while (terms.length) {
        const combinator = [">", "+", "~"].includes(terms.at(-1)) ? terms.pop() : " ";
        const wanted = terms.pop();
        if (combinator === "+" || combinator === "~") {
          const siblings = candidate.parentElement?.children || [];
          let index = siblings.indexOf(candidate) - 1;
          if (combinator === "~") while (index >= 0 && !matchesSimple(siblings[index], wanted)) index -= 1;
          candidate = siblings[index];
        } else {
          candidate = candidate.parentElement;
          if (combinator === " ") while (candidate && !matchesSimple(candidate, wanted)) candidate = candidate.parentElement;
        }
        if (!candidate || !matchesSimple(candidate, wanted)) return false;
      }
      return true;
    });
  }
  let document;
  class Element extends EventTarget {
    constructor(tagName) {
      super();
      this.tagName = tagName.toUpperCase();
      this.nodeType = 1;
      this.children = [];
      this.parentElement = null;
      this.attributes = new Map();
      this.dataset = {};
      this.disabled = false;
      const styleValues = {};
      this.style = new Proxy({
        setProperty: (key, value) => { this.style[key] = String(value); },
        getPropertyValue: (key) => styleValues[key] || "",
        removeProperty: (key) => { delete styleValues[key]; notify({ type: "attributes", target: this, attributeName: "style" }); },
      }, {
        get: (target, key) => key in target ? target[key] : styleValues[key] || "",
        set: (_target, key, value) => {
          if (styleValues[key] !== value) {
            styleValues[key] = value;
            notify({ type: "attributes", target: this, attributeName: "style" });
          }
          return true;
        },
      });
      this.classList = {
        contains: (cls) => this.className.split(/\s+/).includes(cls),
        add: (...classes) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...classes])].join(" "); },
        remove: (...classes) => { this.className = this.className.split(/\s+/).filter((cls) => !classes.includes(cls)).join(" "); },
        toggle: (cls, force) => {
          const enabled = force ?? !this.classList.contains(cls);
          if (enabled) this.classList.add(cls); else this.classList.remove(cls);
          return enabled;
        },
      };
    }
    get ownerDocument() { return document; }
    get parentNode() { return this.parentElement; }
    get childNodes() { return this.children; }
    get firstChild() { return this.children[0] || null; }
    get firstElementChild() { return this.firstChild; }
    get offsetWidth() { return this.getBoundingClientRect().width; }
    get offsetHeight() { return this.getBoundingClientRect().height; }
    get id() { return this.getAttribute("id") || ""; }
    set id(value) { this.setAttribute("id", value); }
    get className() { return this.getAttribute("class") || ""; }
    set className(value) { this.setAttribute("class", value); }
    get title() { return this.getAttribute("title") || ""; }
    set title(value) { this.setAttribute("title", value); }
    get hidden() { return this.hasAttribute("hidden"); }
    set hidden(value) { if (value) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); }
    get textContent() { return this.text || this.children.map((child) => child.textContent).join(""); }
    set textContent(value) { this.text = String(value); }
    get isConnected() { return document.documentElement.contains(this); }
    setAttribute(name, value) {
      if (this.getAttribute(name) === String(value)) return;
      this.attributes.set(name, String(value));
      notify({ type: "attributes", target: this, attributeName: name });
    }
    getAttribute(name) {
      if (name.startsWith("data-") && !this.attributes.has(name)) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        return this.dataset[key] ?? null;
      }
      return this.attributes.get(name) ?? null;
    }
    hasAttribute(name) { return this.getAttribute(name) !== null; }
    removeAttribute(name) {
      if (this.attributes.delete(name)) notify({ type: "attributes", target: this, attributeName: name });
    }
    contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
    append(...nodes) { for (const node of nodes) this.appendChild(node); }
    appendChild(node) { return this.insertBefore(node, null); }
    insertBefore(node, reference) {
      if (node.nodeType === 11) {
        for (const child of [...node.children]) this.insertBefore(child, reference);
        return node;
      }
      node.remove();
      const index = reference ? this.children.indexOf(reference) : this.children.length;
      assert.ok(index >= 0, "fixture insertBefore reference must be a child");
      this.children.splice(index, 0, node);
      node.parentElement = this;
      notify({ type: "childList", target: this, addedNodes: [node], removedNodes: [] });
      return node;
    }
    removeChild(node) { node.remove(); return node; }
    remove() {
      if (!this.parentElement) return;
      const parent = this.parentElement;
      parent.children.splice(parent.children.indexOf(this), 1);
      this.parentElement = null;
      notify({ type: "childList", target: parent, addedNodes: [], removedNodes: [this] });
    }
    replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this.append(...nodes); }
    setPointerCapture(pointerId) {
      assert.ok(activePointers.has(pointerId), "pointer capture requires an active pointer");
      pointerCaptures.set(pointerId, this);
    }
    hasPointerCapture(pointerId) { return pointerCaptures.get(pointerId) === this; }
    releasePointerCapture(pointerId) {
      if (!this.hasPointerCapture(pointerId)) return;
      pointerCaptures.delete(pointerId);
      this.dispatchEvent({ type: "lostpointercapture", pointerId, bubbles: true });
    }
    matches(selector) { return matches(this, selector); }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getClientRects() { return this.getBoundingClientRect().width ? [this.getBoundingClientRect()] : []; }
    getBoundingClientRect() {
      let visible = this.isConnected;
      for (let node = this; node; node = node.parentElement) {
        if (node.hidden || node.style.display === "none" || node.style.visibility === "hidden") visible = false;
      }
      const geometry = (typeof this.rect === "function" ? this.rect() : this.rect) || {};
      let { x = 100, y = 50, width = 30, height = 30 } = geometry;
      if (this.id === ROOT && !this.rect) {
        const css = computedDeclarations(this);
        const children = this.children.filter((child) => !child.hidden && child.style.display !== "none"
          && !child.classList.contains("deno-resource-unavailable") && computedDeclarations(child).display !== "none");
        const gap = Number.parseFloat(css.gap) || 0;
        const childStyles = children.map(computedDeclarations);
        const dimensions = childStyles.map((childCss) => {
          return [Number.parseFloat(childCss.width) || 30, (Number.parseFloat(childCss.height) || 30)
            + (Number.parseFloat(childCss["margin-top"]) || 0) + (Number.parseFloat(childCss["margin-bottom"]) || 0)];
        });
        const padding = Number.parseFloat(css.padding) || 0;
        const border = css.border && css.border !== "none" ? 1 : 0;
        const inset = 2 * (padding + border);
        const vertical = css["flex-direction"] === "column";
        const viewportLimit = (value, dimension) => {
          const expression = value?.match(/^calc\(100v[wh]\s*-\s*(\d+(?:\.\d+)?)px\)$/);
          return expression ? Math.max(0, dimension - Number(expression[1])) : Infinity;
        };
        const maxWidth = viewportLimit(css["max-width"], viewportWidth);
        const maxHeight = viewportLimit(css["max-height"], viewportHeight);
        if (css.display === "grid") {
          const template = css["grid-template-columns"] || "1fr";
          const columns = Number(template.match(/^repeat\(\s*(\d+)\s*,/)?.[1])
            || template.match(/minmax\([^)]*\)|[^\s]+/g)?.length || 1;
          const cssWidth = Number.parseFloat(css.width) || Math.max(0, ...dimensions.map(([w]) => w)) * columns + (columns - 1) * gap;
          width = Math.min(maxWidth, cssWidth + (css["box-sizing"] === "border-box" ? 0 : inset));
          const columnWidth = Math.max(0, (width - inset - (columns - 1) * gap) / columns);
          const rows = [];
          let occupiedColumns = 0;
          for (const [index, childCss] of childStyles.entries()) {
            const fullRow = childCss["grid-column"]?.match(/^1\s*\/\s*-1$/);
            const span = fullRow ? columns : Math.min(columns, Number(childCss["grid-column"]?.match(/span\s+(\d+)/)?.[1]) || 1);
            if (!rows.length || occupiedColumns + span > columns) { rows.push(0); occupiedColumns = 0; }
            const childWidth = childCss.width?.endsWith("%")
              ? (columnWidth * span + gap * (span - 1)) * Number.parseFloat(childCss.width) / 100 : dimensions[index][0];
            dimensions[index][0] = childWidth;
            rows[rows.length - 1] = Math.max(rows.at(-1), dimensions[index][1]);
            occupiedColumns += span;
          }
          height = rows.reduce((sum, row) => sum + row, 0) + Math.max(0, rows.length - 1) * gap + inset;
        } else {
          width = (vertical ? Math.max(0, ...dimensions.map(([w]) => w)) : dimensions.reduce((sum, [w]) => sum + w, 0)
            + Math.max(0, dimensions.length - 1) * gap) + inset;
          height = (vertical ? dimensions.reduce((sum, [, h]) => sum + h, 0) + Math.max(0, dimensions.length - 1) * gap
            : Math.max(0, ...dimensions.map(([, h]) => h))) + inset;
        }
        if (css.display !== "grid" && !vertical && width > maxWidth && css["flex-wrap"] === "wrap") {
          const innerWidth = Math.max(0, maxWidth - inset);
          let rowWidth = 0;
          let rowHeight = 0;
          let totalHeight = 0;
          for (const [w, h] of dimensions) {
            if (rowWidth && rowWidth + gap + w > innerWidth) { totalHeight += rowHeight + gap; rowWidth = 0; rowHeight = 0; }
            rowWidth += (rowWidth ? gap : 0) + w;
            rowHeight = Math.max(rowHeight, h);
          }
          width = Math.max(0, maxWidth);
          height = totalHeight + rowHeight + inset;
        }
        height = Math.min(height, maxHeight);
      }
      if (!this.rect) {
        if (this.style.left !== "") x = Number.parseFloat(this.style.left) || 0;
        else if (this.style.right !== "") x = viewportWidth - width - (Number.parseFloat(this.style.right) || 0);
        if (this.style.top !== "") y = Number.parseFloat(this.style.top) || 0;
      }
      return { x, y, width: visible ? width : 0, height: visible ? height : 0,
        top: y, left: x, right: x + (visible ? width : 0), bottom: y + (visible ? height : 0) };
    }
    click() { if (!this.disabled) this.dispatchEvent({ type: "click" }); }
  }
  document = new EventTarget();
  document.visibilityState = "visible";
  document.documentElement = new Element("html");
  document.head = new Element("head");
  document.body = new Element("body");
  document.documentElement.append(document.head, document.body);
  document.createElement = (tag) => new Element(tag);
  document.createDocumentFragment = () => {
    const fragment = new Element("#fragment");
    fragment.nodeType = 11;
    return fragment;
  };
  document.getElementById = (id) => document.documentElement.querySelector(`#${id}`);
  document.querySelectorAll = (selector) => document.documentElement.querySelectorAll(selector);
  document.querySelector = (selector) => document.documentElement.querySelector(selector);
  document.contains = (node) => document.documentElement.contains(node);
  const host = new Element("div");
  const settingsGroup = new Element("div");
  settingsGroup.id = "fixture-settings";
  host.id = "fixture-menu";
  host.rect = () => ({ x: Math.max(80, viewportWidth - 540), y: 50, width: 528, height: 32 });
  host.append(settingsGroup);
  document.body.append(host);

  function addCrystools(hidden = false) {
    const root = new Element("div");
    root.id = "crystools-monitors-root";
    root.style.display = hidden ? "none" : "flex";
    root.dataset.userOwned = "keep";
    host.insertBefore(root, settingsGroup);
    return root;
  }
  function addCleanup(kind = "full") {
    const button = new Element("button");
    const icon = new Element("i");
    icon.className = kind === "outline" ? "mdi mdi-vacuum-outline" : "mdi mdi-vacuum";
    button.title = kind === "outline" ? "Unload Models" : "Free model and node cache";
    if (kind === "command") {
      button.title = "Localized label";
      icon.className = "localized-icon";
      button.setAttribute("data-command-id", "Comfy.Memory.UnloadModelsAndExecutionCache");
    }
    button.append(icon);
    if (kind === "hidden") button.style.display = "none";
    host.insertBefore(button, settingsGroup);
    return button;
  }
  const crystoolsRoot = crystools === "present" || crystools === "hidden" ? addCrystools(crystools === "hidden") : null;
  const existingCleanup = cleanup !== "absent" ? addCleanup(cleanup) : null;
  const settingsValues = new Map(Object.entries(settings));
  const settingWrites = [];
  const calls = [];
  const responders = new Map();
  let extension;
  let now = 0;
  let nextTimer = 1;
  const timers = new Map();
  const windowEvents = new EventTarget();
  const apiEvents = new EventTarget();
  const settingsEvents = new EventTarget();
  function computedDeclarations(node) {
    const css = document.getElementById("deno-resource-monitor-style")?.textContent || "";
    const declarations = {};
    const specificities = {};
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      // Fixture geometry only needs the simple owned-element rules, not pseudo classes.
      const matching = selectors.split(",").filter((selector) => !selector.includes(":") && node.matches(selector.trim()));
      if (!matching.length) continue;
      const specificity = Math.max(...matching.map((selector) => (selector.match(/#[\w-]+/g)?.length || 0) * 100
        + (selector.match(/\.[\w-]+|\[[^\]]*\]/g)?.length || 0) * 10
        + (selector.match(/(?:^|\s|[>+~])\s*[a-z][\w-]*/gi)?.length || 0)));
      for (const declaration of body.split(";")) {
        const separator = declaration.indexOf(":");
        const property = declaration.slice(0, separator).trim();
        if (separator >= 0 && (specificities[property] ?? -1) <= specificity) {
          declarations[property] = declaration.slice(separator + 1).trim();
          specificities[property] = specificity;
        }
      }
    }
    return declarations;
  }
  const context = {
    console, document, Element, HTMLElement: Element, Node: Element, AbortController,
    innerWidth: viewportWidth, innerHeight: viewportHeight,
    queueMicrotask, URL, URLSearchParams,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.targets = []; this.records = []; observers.add(this); }
      observe(target, options) { this.targets.push({ target, options }); }
      disconnect() { this.targets = []; this.records = []; }
      takeRecords() { return this.records.splice(0); }
    },
    getComputedStyle: (node) => ({ ...computedDeclarations(node), display: node.hidden ? "none" : node.style.display || computedDeclarations(node).display || "flex",
      visibility: node.style.visibility || "visible", opacity: node.style.opacity || "1" }),
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error("Storage unavailable"); return storage.get(key) ?? null; },
      setItem(key, value) { if (storageBlocked) throw new Error("Storage unavailable"); storageWrites.push([key, String(value)]); storage.set(key, String(value)); },
      removeItem(key) { if (storageBlocked) throw new Error("Storage unavailable"); storage.delete(key); },
    },
    setTimeout(callback, delay = 0) { const id = nextTimer++; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    app: {
      menu: { element: host, settingsGroup: { element: settingsGroup }, actionsGroup: { element: host } },
      ui: { settings: {
        getSettingValue: (id) => settingsValues.get(id),
        setSettingValue: (id, value) => {
          const old = settingsValues.get(id);
          settingWrites.push([id, value]); settingsValues.set(id, value);
          extension.settings.find((item) => item.id === id)?.onChange?.(value, old);
          settingsEvents.dispatchEvent({ type: `${id}.change`, detail: { value } });
        },
        addEventListener: settingsEvents.addEventListener.bind(settingsEvents),
      } },
      extensionManager: { toast: { add() {} } },
      registerExtension(value) {
        extension = value;
        for (const setting of value.settings) if (!settingsValues.has(setting.id)) settingsValues.set(setting.id, setting.defaultValue);
      },
    },
    api: {
      addEventListener: apiEvents.addEventListener.bind(apiEvents),
      async fetchApi(url, options = {}) {
        calls.push({ url, options });
        if (responders.has(url)) return await responders.get(url)(options);
        if (url === "/extensions") return response(crystools === "absent" ? [] : ["/extensions/ComfyUI-Crystools/monitor.js"]);
        if (url === "/queue") return response({ queue_running: [], queue_pending: [] });
        if (url === "/deno/resource-monitor") return response(metrics);
        if (url === "/free") return response({});
        throw new Error(`Unexpected API request ${url}`);
      },
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: scriptPath });
  assert.equal(extension.name, "Deno.ResourceMonitor");

  async function advance(milliseconds) {
    const end = now + milliseconds;
    await flush();
    for (let step = 0; step < 1000; step += 1) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) { now = end; await flush(); return; }
      const [id, timer] = next;
      now = timer.due;
      timers.delete(id);
      timer.callback();
      await flush();
    }
    assert.fail("extension created an unbounded timer loop");
  }
  return {
    document, host, settingsGroup, context, calls, responders, settingWrites, settingsValues, storage, storageWrites,
    pointerCaptures, crystoolsRoot, existingCleanup,
    addCrystools, addCleanup, advance,
    emitApi(type, detail) { apiEvents.dispatchEvent({ type, detail }); },
    async resize(width, height = viewportHeight) {
      viewportWidth = width;
      viewportHeight = height;
      context.innerWidth = width;
      context.innerHeight = height;
      windowEvents.dispatchEvent({ type: "resize" });
      await advance(250);
    },
    async setCoreSetting(id, value) {
      settingsValues.set(id, value);
      settingsEvents.dispatchEvent({ type: `${id}.change`, detail: { value } });
      await flush();
    },
    count: (url) => calls.filter((call) => call.url === url).length,
    root: () => document.getElementById(ROOT),
    meters: () => document.querySelectorAll(`#${ROOT} .deno-resource-meter`),
    button: () => document.querySelector(`#${ROOT} .deno-resource-free`),
    grip: () => document.querySelector(`#${ROOT} .deno-resource-grip`),
    rotate: () => document.querySelector(`#${ROOT} .deno-resource-rotate`),
    cue: () => document.getElementById("deno-resource-monitor-dock-cue"),
    async pointer(target, type, { x = 0, y = 0, pointerId = 1, ...extra } = {}) {
      if (type === "pointerdown") activePointers.add(pointerId);
      const event = { type, clientX: x, clientY: y, pointerId, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1,
        isPrimary: true, bubbles: true, ...extra };
      (pointerCaptures.get(pointerId) || target).dispatchEvent(event);
      if (type === "pointerup" || type === "pointercancel") {
        pointerCaptures.get(pointerId)?.releasePointerCapture(pointerId);
        activePointers.delete(pointerId);
      }
      await advance(100);
      return event;
    },
    async windowEvent(type, extra = {}) { windowEvents.dispatchEvent({ type, ...extra }); await advance(250); },
    async boot() { extension.setup(); await advance(500); },
    async setSetting(id, value) {
      const old = settingsValues.get(id);
      settingsValues.set(id, value);
      const setting = extension.settings.find((item) => item.id === id);
      assert.ok(setting, `setting ${id} must be registered`);
      setting.onChange?.(value, old);
      await advance(250);
    },
    async visibility(value) { document.visibilityState = value; document.dispatchEvent({ type: "visibilitychange" }); await advance(250); },
  };
}

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}

function serialize(node) {
  return JSON.stringify({ attributes: [...node.attributes], dataset: node.dataset,
    display: node.style.display, visibility: node.style.visibility,
    children: node.children.map(serialize) });
}

function cssDeclarations(css, selector) {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(",").some((candidate) => candidate.trim() === selector));
  assert.ok(rules.length, `the installed stylesheet must contain ${selector}`);
  return Object.fromEntries(rules.flatMap((rule) => rule[2].split(";")).filter((declaration) => declaration.includes(":"))
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      return [declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim().replace(/\s+/g, " ")];
    }));
}

function assertWithinViewport(h, message = "floating monitor stays visible") {
  const rect = h.root().getBoundingClientRect();
  assert.ok(Number.isFinite(rect.left) && Number.isFinite(rect.top), `${message}: finite coordinates`);
  assert.ok(rect.left >= 0 && rect.top >= 0, `${message}: top/left`);
  assert.ok(rect.right <= h.context.innerWidth && rect.bottom <= h.context.innerHeight, `${message}: right/bottom`);
}

function assertNativePositionUntouched(h, original) {
  assert.deepEqual([...h.storage].filter(([key]) => key.startsWith("Comfy.MenuPosition.")), original,
    "monitor placement must preserve native Run toolbar positions");
  assert.ok(h.storageWrites.every(([key]) => key === POSITION), "dragging writes only the DENO position key");
  assert.ok(h.settingWrites.every(([key]) => key === PLACEMENT), "dragging writes only DENO placement, not display settings");
}

async function beginDrag(h, { x = 500, y = 350 } = {}) {
  const rect = h.root().getBoundingClientRect();
  await h.pointer(h.grip(), "pointerdown", { x: rect.left + 8, y: rect.top + 15 });
  await h.pointer(h.document.body, "pointermove", { x, y });
  assert.ok(h.root().classList.contains("deno-resource-floating"), "handle drag undocks DENO's own root");
  assert.ok(h.cue(), "drag exposes the owned top dock cue");
  return { x, y };
}

async function dragTo(h, coordinates = { x: 500, y: 350 }) {
  const point = await beginDrag(h, coordinates);
  await h.pointer(h.document.body, "pointerup", point);
}

// Existing visible and user-hidden Crystools retain ownership of resource display.
for (const crystools of ["absent", "present", "hidden", "registered-only"]) {
  for (const cleanup of ["absent", "full", "outline", "hidden", "command"]) {
    const h = makeHarness({ crystools, cleanup });
    const originalCrystools = h.crystoolsRoot && serialize(h.crystoolsRoot);
    const originalCleanup = h.existingCleanup && serialize(h.existingCleanup);
    await h.boot();
    const wantMeters = crystools === "absent";
    const wantButton = crystools === "absent" || !["full", "command"].includes(cleanup);
    assert.equal(h.meters().length, wantMeters ? 5 : 0, `${crystools}/${cleanup}: meter ownership`);
    assert.equal(Boolean(h.button()), wantButton, `${crystools}/${cleanup}: full DENO base UI or Crystools cleanup fallback`);
    assert.equal(Boolean(h.root()), wantMeters || wantButton, `${crystools}/${cleanup}: empty bars are absent`);
    if (!wantMeters) assert.equal(h.count("/deno/resource-monitor"), 0, "button-only mode must not poll hardware");
    if (h.crystoolsRoot) assert.equal(serialize(h.crystoolsRoot), originalCrystools, "Auto must preserve existing Crystools DOM");
    if (h.existingCleanup) assert.equal(serialize(h.existingCleanup), originalCleanup, "Auto must preserve existing cleanup DOM");
    assert.deepEqual(h.settingWrites, [], "Auto must not rewrite user settings");
  }
}

// Without Crystools the default DENO UI includes its own cleanup control, even
// when a legacy/native control appears later. Existing controls remain untouched.
{
  const h = makeHarness();
  await h.boot();
  const ownedRoot = h.root();
  const ownedButton = h.button();
  assert.ok(ownedButton);
  const counterpart = h.addCleanup();
  const originalNative = serialize(counterpart);
  const assertFullDenoUi = () => {
    assert.equal(h.root(), ownedRoot);
    assert.equal(h.button(), ownedButton, "native cleanup visibility must not replace DENO's default control when Crystools is absent");
    assert.equal(h.meters().length, 5);
    assert.equal(counterpart.parentElement, h.host, "the existing native cleanup control keeps its own parent");
    assert.deepEqual(h.settingWrites, []);
  };
  await h.advance(500);
  assertFullDenoUi();
  assert.equal(serialize(counterpart), originalNative);
  counterpart.style.display = "none";
  await h.advance(500);
  assertFullDenoUi();
  counterpart.style.removeProperty("display");
  await h.advance(500);
  assertFullDenoUi();
  assert.equal(serialize(counterpart), originalNative, "DENO does not alter the restored native cleanup control");
  await h.setSetting(CLEANUP, "Off");
  assert.equal(h.button(), null, "an explicit cleanup Off still overrides the default full DENO UI");
  assert.equal(h.meters().length, 5);
  assert.equal(serialize(counterpart), originalNative);
  await h.setSetting(CLEANUP, "Auto");
  assert.ok(h.button(), "returning to Auto restores DENO's own cleanup despite a visible native control");
}

// Unknown Crystools detection keeps the conservative cleanup fallback rather
// than assuming absence and duplicating an already available native control.
{
  const h = makeHarness({ cleanup: "full" });
  h.responders.set("/extensions", async () => response({}, 503));
  await h.boot();
  assert.equal(h.meters().length, 0);
  assert.equal(h.button(), null);
  assert.equal(h.count("/deno/resource-monitor"), 0);
}

// Late legacy attachment, disappearing buttons, hidden ancestors and host remounts.
{
  const h = makeHarness({ crystools: "present" });
  await h.boot();
  const detachedRoot = h.root();
  detachedRoot.remove();
  await h.advance(500);
  assert.equal(h.root(), detachedRoot, "external removal reattaches the owned root without replacing it");
  assert.ok(h.button()?.isConnected);
  const counterpart = h.addCleanup();
  await h.advance(500);
  assert.equal(h.button(), null, "a later genuine cleanup button removes only the DENO fallback");
  counterpart.style.display = "none";
  await h.advance(500);
  assert.ok(h.button(), "an existing but hidden button cannot satisfy the fallback");
  counterpart.style.display = "flex";
  await h.advance(500);
  assert.equal(h.button(), null);
  counterpart.remove();
  await h.advance(500);
  assert.ok(h.button(), "removing a counterpart restores the DENO fallback");
  const replacement = h.document.createElement("div");
  const replacementSettings = h.document.createElement("div");
  replacement.append(replacementSettings);
  h.context.app.menu.element = replacement;
  h.context.app.menu.settingsGroup.element = replacementSettings;
  h.context.app.menu.actionsGroup.element = replacement;
  h.host.remove();
  h.document.body.append(replacement);
  await h.advance(500);
  assert.ok(h.button()?.isConnected, "the owned fallback reattaches after the menu host remounts");
  assert.equal(h.count("/deno/resource-monitor"), 0);
}

// Unknown extension detection conservatively retains ownership, while cleanup
// remains independent. A late Crystools mount cancels DENO's active sampling.
{
  const h = makeHarness();
  h.responders.set("/extensions", async () => response({}, 503));
  await h.boot();
  assert.equal(h.meters().length, 0);
  assert.ok(h.button());
  assert.equal(h.count("/deno/resource-monitor"), 0);
  h.responders.set("/extensions", async () => response([]));
  h.emitApi("reconnected");
  await h.advance(500);
  assert.equal(h.meters().length, 5, "server reconnect retries previously unknown extension ownership");
  const lateCrystools = h.addCrystools();
  const original = serialize(lateCrystools);
  await h.advance(500);
  assert.equal(h.meters().length, 0, "late Crystools attachment takes ownership in Auto");
  assert.ok(h.button());
  const count = h.count("/deno/resource-monitor");
  await h.advance(3000);
  assert.equal(h.count("/deno/resource-monitor"), count);
  assert.equal(serialize(lateCrystools), original);
}

// A hidden ancestor makes a full cleanup button unavailable too; similarly an
// unrelated dialog's cleanup button must not suppress the top-bar control.
{
  const h = makeHarness({ crystools: "present" });
  await h.boot();
  const dialog = h.document.createElement("div");
  const dialogButton = h.addCleanup();
  dialog.append(dialogButton);
  h.document.body.append(dialog);
  await h.advance(500);
  assert.ok(h.button(), "cleanup detection is scoped to the actual toolbar");
  const group = h.document.createElement("div");
  group.style.display = "none";
  group.append(h.addCleanup());
  h.host.append(group);
  await h.advance(500);
  assert.ok(h.button(), "hidden ancestor cannot satisfy the full-cleanup counterpart");
  group.style.display = "flex";
  await h.advance(500);
  assert.equal(h.button(), null);
}

// Once real Crystools DOM has been seen, a late stale manifest response cannot
// reinterpret its user's subsequent hidden/removed UI as an uninstalled plugin.
{
  const h = makeHarness();
  const detection = deferred();
  h.responders.set("/extensions", () => detection.promise);
  await h.boot();
  const crystools = h.addCrystools();
  await h.advance(250);
  crystools.remove();
  await h.advance(250);
  detection.resolve(response([]));
  await h.advance(500);
  assert.equal(h.meters().length, 0);
  assert.equal(h.count("/deno/resource-monitor"), 0);
}

// Meter settings and cleanup settings are genuinely independent; old polls die.
{
  const h = makeHarness();
  await h.boot();
  await h.setSetting(CLEANUP, "Off");
  assert.equal(h.button(), null);
  assert.equal(h.meters().length, 5);
  await h.setSetting(MODE, "Off");
  assert.equal(h.root(), null);
  const polls = h.count("/deno/resource-monitor");
  await h.advance(5000);
  assert.equal(h.count("/deno/resource-monitor"), polls, "turning meters off invalidates every scheduled poll");
  await h.setSetting(CLEANUP, "Show");
  assert.ok(h.button());
  assert.equal(h.meters().length, 0);
  await h.advance(2500);
  assert.equal(h.count("/deno/resource-monitor"), polls, "cleanup-only explicitly remains telemetry-free");
  await h.setSetting(MODE, "Auto");
  assert.equal(h.meters().length, 5);
  await h.visibility("hidden");
  const hiddenPolls = h.count("/deno/resource-monitor");
  await h.advance(3000);
  assert.equal(h.count("/deno/resource-monitor"), hiddenPolls, "hidden tabs stop hardware polling");
  await h.visibility("visible");
  const visiblePolls = h.count("/deno/resource-monitor");
  await h.advance(3000);
  assert.equal(h.count("/deno/resource-monitor") - visiblePolls, 3, "visibility resumes one polling chain");
}

// Late results cannot recreate an opted-out monitor or overwrite a newer poll.
{
  const h = makeHarness();
  const pendingDetection = deferred();
  h.responders.set("/extensions", () => pendingDetection.promise);
  await h.boot();
  await h.setSetting(MODE, "Off");
  pendingDetection.resolve(response([]));
  await h.advance(500);
  assert.equal(h.meters().length, 0);
  assert.equal(h.count("/deno/resource-monitor"), 0);

  const pendingSnapshot = deferred();
  h.responders.set("/deno/resource-monitor", () => pendingSnapshot.promise);
  await h.setSetting(MODE, "Auto");
  const oldRequest = h.calls.findLast((call) => call.url === "/deno/resource-monitor");
  await h.setSetting(MODE, "Off");
  assert.equal(oldRequest.options.signal.aborted, true, "turning meters off aborts the in-flight sample");
  h.responders.set("/deno/resource-monitor", async () => response(sample));
  await h.setSetting(MODE, "Auto");
  pendingSnapshot.resolve(response({ ...sample, cpu_percent: 99 }));
  await h.advance(250);
  const cpu = h.meters().find((meter) => meter.dataset.key === "cpu");
  assert.equal(cpu.getAttribute("aria-valuenow"), "25", "a stale response cannot overwrite the newly mounted meter");
}

// Only DENO's own root leaves a cramped toolbar. A stretched breadcrumb wrapper
// is not an obstacle; its visible controls are. Resize and hide/show are reversible.
for (const crystools of ["absent", "present"]) {
  const h = makeHarness({ crystools });
  const nativeRun = h.document.createElement("button");
  nativeRun.setAttribute("aria-label", "Run");
  h.host.append(nativeRun);
  const breadcrumb = h.document.createElement("div");
  breadcrumb.className = "subgraph-breadcrumb";
  breadcrumb.rect = { x: 72, y: 50, width: 1320, height: 32 };
  const graphControl = h.document.createElement("button");
  graphControl.rect = { x: 72, y: 50, width: 144, height: 32 };
  const emptyTrail = h.document.createElement("nav");
  emptyTrail.style.display = "none";
  emptyTrail.rect = { x: 216, y: 50, width: 1176, height: 32 };
  breadcrumb.append(graphControl, emptyTrail);
  h.document.body.append(breadcrumb);
  const existingNodes = [...h.host.children];
  const originalExisting = existingNodes.map(serialize);
  const originalBreadcrumb = serialize(breadcrumb);
  const assertExistingUntouched = () => {
    assert.deepEqual(h.host.children.filter((node) => node.id !== ROOT), existingNodes);
    assert.deepEqual(existingNodes.map(serialize), originalExisting, "responsive placement must not edit existing toolbar controls");
    assert.equal(serialize(breadcrumb), originalBreadcrumb, "responsive placement must not edit Graph/breadcrumb controls");
    assert.deepEqual(h.settingWrites, []);
  };
  await h.boot();
  const ownedRoot = h.root();
  assert.equal(ownedRoot.parentElement, h.host, "1440px should dock inline despite a stretched breadcrumb wrapper");
  assert.equal(ownedRoot.classList.contains("deno-resource-detached"), false);
  assertExistingUntouched();
  for (const width of [800, 600]) {
    await h.resize(width);
    assert.equal(h.root(), ownedRoot, "resizing must preserve the same owned DOM and event listeners");
    assert.equal(ownedRoot.parentElement, h.document.body, `${width}px should place only DENO's root below the toolbar`);
    assert.equal(ownedRoot.classList.contains("deno-resource-detached"), true);
    assert.ok(Number.parseFloat(ownedRoot.style.top) > h.host.getBoundingClientRect().bottom);
    assert.ok(h.button());
    assert.equal(h.meters().length, crystools === "present" ? 0 : 5);
    assertExistingUntouched();
  }
  ownedRoot.remove();
  await h.advance(250);
  assert.equal(h.root(), ownedRoot, "an externally removed detached root is also recovered");
  assert.equal(ownedRoot.parentElement, h.document.body);
  h.host.style.display = "none";
  await h.advance(250);
  assert.equal(ownedRoot.parentElement, h.host, "hiding the native toolbar must not leave a floating DENO control behind");
  assert.equal(ownedRoot.classList.contains("deno-resource-detached"), false);
  assert.equal(ownedRoot.getClientRects().length, 0);
  h.host.style.display = "flex";
  await h.advance(250);
  assert.equal(ownedRoot.parentElement, h.document.body, "showing the narrow toolbar restores the owned detached row");
  await h.resize(1440);
  assert.equal(ownedRoot.parentElement, h.host, "returning to 1440px redocks inline");
  assert.equal(ownedRoot.classList.contains("deno-resource-detached"), false);
  assert.equal(ownedRoot.style.top, "");
  assert.equal(ownedRoot.style.right, "");
  assertExistingUntouched();
  if (crystools === "present") assert.equal(h.count("/deno/resource-monitor"), 0);
}

{
  const h = makeHarness({ metrics: { ...sample, gpus: [] }, settings: { [CLEANUP]: "Off" } });
  await h.boot();
  for (const width of [800, 600]) {
    await h.resize(width);
    assert.equal(h.root().parentElement, h.document.body);
    const available = h.meters().filter((meter) => !meter.classList.contains("deno-resource-unavailable"));
    assert.deepEqual(available.map((meter) => meter.dataset.key), ["cpu", "ram"], "CPU/RAM-only hardware keeps its available readings at narrow widths");
    assert.equal(h.button(), null);
  }
  await h.resize(1440);
  assert.equal(h.root().parentElement, h.host);
}

// Missing GPU values must not silently become numeric zero through Number(null).
{
  const h = makeHarness({ metrics: { cpu_percent: null, ram_percent: null, ram_used: null, ram_total: null,
    gpus: [{ index: 0, gpu_percent: null, vram_percent: null, vram_used: null, vram_total: null, temperature: null }] } });
  await h.boot();
  for (const meter of h.meters()) {
    assert.equal(meter.getAttribute("aria-valuenow"), null, `${meter.dataset.key}: unavailable metric has no number`);
    assert.equal(meter.querySelector(".deno-resource-value").textContent, "--", "missing readings retain a truthful placeholder");
    assert.equal(meter.classList.contains("deno-resource-unavailable"), ["gpu", "vram", "temperature"].includes(meter.dataset.key), "only unavailable GPU fields hide while CPU/RAM retain their placeholder");
  }
}

// Preserve the familiar Crystools meter dimensions, typography and palette.
// Read only selected declarations from the stylesheet actually installed by setup.
{
  const h = makeHarness();
  await h.boot();
  const css = h.document.getElementById("deno-resource-monitor-style").textContent;
  const properties = [
    [`#${ROOT}`, { gap: "5px" }],
    [`#${ROOT} .deno-resource-meter`, { width: "60px", height: "30px" }],
    [`#${ROOT} .deno-resource-grip + .deno-resource-meter`, { "border-top-left-radius": "4px", "border-bottom-left-radius": "4px" }],
    [`#${ROOT} .deno-resource-meter:not(:has(~ .deno-resource-meter:not(.deno-resource-unavailable)))`, { "border-top-right-radius": "4px", "border-bottom-right-radius": "4px" }],
    [`#${ROOT} .deno-resource-label`, { "font-size": "10px", "font-weight": "100", bottom: "2px", left: "3px" }],
    [`#${ROOT} .deno-resource-value`, { "font-size": "11px", "font-weight": "500", top: "2px", right: "2px" }],
  ];
  for (const [selector, expected] of properties) {
    const actual = cssDeclarations(css, selector);
    for (const [property, value] of Object.entries(expected)) {
      assert.equal(actual[property], value, `${selector}: ${property} must match the established meter appearance`);
    }
  }
  const meters = new Map(h.meters().map((meter) => [meter.dataset.key, meter]));
  for (const [key, color] of Object.entries({ cpu: "#0AA015", ram: "#07630D", gpu: "#0C86F4", vram: "#176EC7" })) {
    assert.equal(meters.get(key).style.getPropertyValue("--deno-resource-color").toUpperCase(), color);
  }
}

// Fractional measurements use the same integer floor for the text and bar.
{
  const h = makeHarness({ metrics: { ...sample, cpu_percent: 37.9, ram_percent: 62.5,
    gpus: [{ ...sample.gpus[0], gpu_percent: 99.9, vram_percent: 0.9, temperature: 54.9 }] } });
  await h.boot();
  const expected = { cpu: 37, ram: 62, gpu: 99, vram: 0, temperature: 54 };
  for (const meter of h.meters()) {
    const value = expected[meter.dataset.key];
    const suffix = meter.dataset.key === "temperature" ? "°" : "%";
    assert.equal(meter.querySelector(".deno-resource-value").textContent, `${value}${suffix}`);
    assert.equal(meter.querySelector(".deno-resource-fill").style.width, `${value}%`);
    assert.equal(meter.getAttribute("aria-valuenow"), String(value));
  }
}

// Temperature is a reading rather than a percentage; valid zero stays available.
for (const temperature of [105, -5, 0, 54.9, 105.8, -5.2]) {
  const h = makeHarness({ metrics: { ...sample, cpu_percent: 150,
    gpus: [{ ...sample.gpus[0], gpu_percent: 0, temperature }] } });
  await h.boot();
  const meters = new Map(h.meters().map((meter) => [meter.dataset.key, meter]));
  const temperatureFill = meters.get("temperature").querySelector(".deno-resource-fill");
  const boundedTemperature = Math.min(100, Math.max(0, temperature));
  assert.equal(meters.get("temperature").querySelector(".deno-resource-value").textContent, `${Math.floor(temperature)}°`, "temperature is floored for display but not clamped to percentage bounds");
  assert.equal(temperatureFill.style.width, `${Math.floor(boundedTemperature)}%`, "temperature fill stays within the meter");
  assert.equal(temperatureFill.style.backgroundColor, `color-mix(in srgb, #ff0000 ${boundedTemperature}%, #00ff00)`, "temperature uses the established red/green mix with a bounded proportion");
  assert.equal(meters.get("cpu").getAttribute("aria-valuenow"), "100", "percentage meters remain bounded");
  assert.equal(meters.get("gpu").getAttribute("aria-valuenow"), "0", "a genuine measured zero remains available");
  assert.equal(meters.get("gpu").classList.contains("deno-resource-unavailable"), false);
}

// Queue errors and busy queues fail closed; no memory-changing POST is allowed.
for (const result of [response({}, 503), response({}), response({ queue_running: [[1]], queue_pending: [] }), response({ queue_running: [], queue_pending: [[1]] })]) {
  const h = makeHarness({ crystools: "present" });
  await h.boot();
  h.responders.set("/queue", async () => result);
  h.button().click();
  await h.advance(2000);
  assert.equal(h.count("/free"), 0, "busy/unknown queue must never reach the free endpoint");
  assert.equal(h.count("/deno/resource-monitor"), 0);
}

{
  const h = makeHarness({ crystools: "present", settings: { "Comfy.Memory.AllowManualUnload": false } });
  await h.boot();
  assert.equal(h.button().disabled, true, "ComfyUI's manual-unload preference is respected");
  h.button().dispatchEvent({ type: "click" });
  await h.advance(1000);
  assert.equal(h.count("/free"), 0, "even a programmatic activation cannot bypass the preference");
  await h.setCoreSetting("Comfy.Memory.AllowManualUnload", true);
  assert.equal(h.button().disabled, false, "changing the core preference immediately updates disabled appearance");
  await h.setCoreSetting("Comfy.Memory.AllowManualUnload", false);
  assert.equal(h.button().disabled, true);
}

// The action lock is acquired before asynchronous queue preflight, not after it.
{
  const h = makeHarness({ crystools: "present" });
  await h.boot();
  const pendingQueue = deferred();
  h.responders.set("/queue", () => pendingQueue.promise);
  const button = h.button();
  button.dispatchEvent({ type: "click" });
  button.dispatchEvent({ type: "click" });
  await flush();
  pendingQueue.resolve(response({ queue_running: [], queue_pending: [] }));
  await h.advance(2000);
  assert.equal(h.count("/free"), 1, "double activation during preflight must produce exactly one cleanup");
  assert.deepEqual(JSON.parse(h.calls.find((call) => call.url === "/free").options.body), { unload_models: true, free_memory: true });
  assert.equal(h.count("/deno/resource-monitor"), 0, "cleanup feedback must not start telemetry in button-only mode");
}

// Only the dedicated grip may undock the monitor, and tiny clicks stay docked.
{
  const nativeStorage = new Map([
    ["Comfy.MenuPosition.Docked", "false"],
    ["Comfy.MenuPosition.Floating", '{"x":300,"y":600}'],
  ]);
  const h = makeHarness({ storage: new Map(nativeStorage) });
  await h.boot();
  const root = h.root();
  const cleanup = h.button();
  assert.ok(h.grip(), "monitor exposes its own move handle");
  assert.equal(h.settingsValues.get(PLACEMENT), "Top", "existing users keep top placement by default");
  assert.ok(!h.rotate() || h.rotate().hidden, "rotation is offered only in manual floating placement");
  for (const target of [h.meters()[0], cleanup, root]) {
    await h.pointer(target, "pointerdown", { x: 108, y: 65 });
    await h.pointer(h.document.body, "pointermove", { x: 500, y: 350 });
    await h.pointer(h.document.body, "pointerup", { x: 500, y: 350 });
    assert.equal(root.parentElement, h.host, "dragging readings or cleanup does not move the bar");
    assert.equal(h.cue(), null);
  }
  await h.pointer(h.grip(), "pointerdown", { x: 108, y: 65, button: 2 });
  await h.pointer(h.document.body, "pointermove", { x: 500, y: 350 });
  await h.pointer(h.document.body, "pointerup", { x: 500, y: 350 });
  assert.equal(root.parentElement, h.host, "secondary-button press does not start dragging");
  await h.pointer(h.grip(), "pointerdown", { x: 108, y: 65 });
  await h.pointer(h.document.body, "pointermove", { x: 111, y: 65 });
  assert.equal(root.parentElement, h.host, "movement below the 4px threshold stays docked");
  await h.pointer(h.document.body, "pointerup", { x: 111, y: 65 });
  assert.equal(h.cue(), null);
  assert.deepEqual(h.settingWrites, [], "a handle click does not change the saved placement");
  assert.deepEqual(h.storageWrites, [], "a handle click does not save a floating position");

  const down = await h.pointer(h.grip(), "pointerdown", { x: 108, y: 65 });
  assert.equal(down.propagationStopped, true, "handle input cannot reach native toolbar or canvas controls");
  await h.pointer(h.document.body, "pointermove", { x: 500, y: 350, pointerId: 2 });
  assert.equal(root.parentElement, h.host, "a different pointer cannot advance the active grip drag");
  await h.pointer(h.document.body, "pointermove", { x: 113, y: 65 });
  assert.equal(root.parentElement, h.document.body, "movement beyond the threshold floats the same owned DOM");
  assert.equal(h.pointerCaptures.size, 1, "active drag captures the pointer after undocking");
  await h.pointer(h.document.body, "pointermove", { x: 500, y: 350 });
  await h.pointer(h.document.body, "pointerup", { x: 500, y: 350 });
  assert.equal(h.root(), root);
  assert.equal(h.button(), cleanup);
  assert.equal(h.settingsValues.get(PLACEMENT), "Floating");
  assert.equal(h.pointerCaptures.size, 0);
  assert.equal(h.cue(), null);
  assertWithinViewport(h);
  const saved = JSON.parse(h.storage.get(POSITION));
  assert.equal(saved.version, 1);
  assert.equal(saved.orientation, "horizontal");
  assert.equal(saved.x, root.getBoundingClientRect().left);
  assert.equal(saved.y, root.getBoundingClientRect().top);
  assert.equal(h.count("/free"), 0, "placement actions never request memory cleanup");
  assertNativePositionUntouched(h, [...nativeStorage]);
  const polls = h.count("/deno/resource-monitor");
  await h.advance(3000);
  assert.equal(h.count("/deno/resource-monitor") - polls, 3, "dragging preserves exactly one hardware polling chain");
}

// Snapping uses the visible DENO cue's current geometry, not a screen-edge guess.
{
  const h = makeHarness();
  await h.boot();
  await beginDrag(h);
  h.cue().rect = { x: 800, y: 32, width: 150, height: 30 };
  await h.pointer(h.document.body, "pointermove", { x: 200, y: 40 });
  assert.equal(h.cue().classList.contains("deno-resource-dock-active"), false,
    "being near the top outside the actual cue is not a dock target");
  await h.pointer(h.document.body, "pointermove", { x: 825, y: 45 });
  assert.equal(h.cue().classList.contains("deno-resource-dock-active"), true, "cue highlights inside its actual rectangle");
  await h.pointer(h.document.body, "pointermove", { x: 975, y: 45 });
  assert.equal(h.cue().classList.contains("deno-resource-dock-active"), false, "leaving the cue clears its highlight");
  await h.pointer(h.document.body, "pointermove", { x: 825, y: 45 });
  await h.pointer(h.document.body, "pointerup", { x: 825, y: 45 });
  assert.equal(h.settingsValues.get(PLACEMENT), "Top");
  assert.equal(h.root().parentElement, h.host);
  assert.equal(h.root().classList.contains("deno-resource-floating"), false);
  assert.equal(h.root().style.left, "", "top placement clears manual left coordinates");
  assert.equal(h.cue(), null);
  assert.equal(h.pointerCaptures.size, 0);
  assert.equal(h.count("/free"), 0);
}

// Interrupted drags restore the starting placement and release owned UI/capture.
for (const cancellation of ["pointercancel", "lostpointercapture", "blur", "Escape"]) {
  for (const initialPlacement of ["Top", "Floating"]) {
    const initialPosition = { version: 1, x: 200, y: 220, orientation: "horizontal" };
    const h = makeHarness({ settings: { [PLACEMENT]: initialPlacement }, storage: new Map([[POSITION, JSON.stringify(initialPosition)]]) });
    await h.boot();
    const before = h.root().getBoundingClientRect();
    const storedBefore = h.storage.get(POSITION);
    await beginDrag(h);
    if (cancellation === "pointercancel") await h.pointer(h.document.body, "pointercancel", { x: 500, y: 350 });
    else if (cancellation === "lostpointercapture") { h.grip().releasePointerCapture(1); await h.advance(100); }
    else if (cancellation === "blur") await h.windowEvent("blur");
    else await h.windowEvent("keydown", { key: "Escape" });
    assert.equal(h.settingsValues.get(PLACEMENT), initialPlacement, `${cancellation} restores ${initialPlacement} placement`);
    assert.equal(h.cue(), null, `${cancellation} removes the temporary dock cue`);
    assert.equal(h.pointerCaptures.size, 0, `${cancellation} releases the captured pointer`);
    assert.equal(h.storage.get(POSITION), storedBefore, `${cancellation} does not persist an interrupted drag`);
    assert.equal(h.root().getBoundingClientRect().left, before.left);
    assert.equal(h.root().getBoundingClientRect().top, before.top);
    await h.pointer(h.document.body, "pointerup", { x: 700, y: 500 });
    assert.equal(h.settingsValues.get(PLACEMENT), initialPlacement, "late pointerup cannot finish a cancelled drag");
    assert.equal(h.count("/free"), 0);
  }
}

// Turning the controls off during a drag destroys its temporary UI and restores
// the original manual position when the controls are enabled again.
{
  const position = { version: 1, x: 200, y: 220, orientation: "horizontal" };
  const h = makeHarness({ settings: { [PLACEMENT]: "Floating" }, storage: new Map([[POSITION, JSON.stringify(position)]]) });
  await h.boot();
  const before = h.root().getBoundingClientRect();
  const saved = h.storage.get(POSITION);
  await beginDrag(h);
  await h.setSetting(MODE, "Off");
  await h.setSetting(CLEANUP, "Off");
  assert.equal(h.root(), null);
  assert.equal(h.cue(), null, "Off during drag removes the owned drop cue");
  assert.equal(h.pointerCaptures.size, 0, "Off during drag releases the pointer");
  await h.pointer(h.document.body, "pointermove", { x: 900, y: 600 });
  await h.pointer(h.document.body, "pointerup", { x: 900, y: 600 });
  assert.equal(h.storage.get(POSITION), saved, "late drag events after destruction cannot save a position");
  await h.setSetting(MODE, "Auto");
  await h.setSetting(CLEANUP, "Auto");
  assert.equal(h.root().getBoundingClientRect().left, before.left);
  assert.equal(h.root().getBoundingClientRect().top, before.top);
  assert.equal(h.settingsValues.get(PLACEMENT), "Floating");
}

// Manual floating ignores automatic toolbar relocation while preserving owned
// DOM, clamps viewport changes, and survives toolbar remounts and Off/On.
{
  const h = makeHarness({ settings: { [PLACEMENT]: "Floating" } });
  await h.boot();
  const ownedRoot = h.root();
  assert.equal(ownedRoot.parentElement, h.document.body);
  assert.ok(ownedRoot.classList.contains("deno-resource-floating"));
  assertWithinViewport(h, "initial floating placement");
  await dragTo(h, { x: 1380, y: 850 });
  assertWithinViewport(h, "drag clamp");
  for (const [width, height] of [[800, 600], [600, 400], [1440, 900]]) {
    await h.resize(width, height);
    assert.equal(h.root(), ownedRoot);
    assert.equal(ownedRoot.parentElement, h.document.body, "manual floating does not redock on wide windows");
    assertWithinViewport(h, "resize clamp");
  }
  const beforeMutation = ownedRoot.getBoundingClientRect();
  h.host.style.display = "none";
  await h.advance(250);
  assert.equal(ownedRoot.parentElement, h.document.body, "manual floating is independent of native toolbar visibility");
  h.host.style.display = "flex";
  await h.advance(250);
  assert.equal(ownedRoot.getBoundingClientRect().left, beforeMutation.left);
  assert.equal(ownedRoot.getBoundingClientRect().top, beforeMutation.top);
  ownedRoot.remove();
  await h.advance(250);
  assert.equal(h.root(), ownedRoot, "external removal remounts the same manually positioned monitor");
  const replacement = h.document.createElement("div");
  const replacementSettings = h.document.createElement("div");
  replacement.append(replacementSettings);
  h.context.app.menu.element = replacement;
  h.context.app.menu.settingsGroup.element = replacementSettings;
  h.context.app.menu.actionsGroup.element = replacement;
  h.host.remove();
  h.document.body.append(replacement);
  await h.advance(250);
  assert.equal(h.root(), ownedRoot);
  assert.equal(ownedRoot.parentElement, h.document.body);
  assertWithinViewport(h, "native toolbar remount");
  const position = h.root().getBoundingClientRect();
  await h.setSetting(MODE, "Off");
  await h.setSetting(CLEANUP, "Off");
  assert.equal(h.root(), null);
  const polls = h.count("/deno/resource-monitor");
  await h.advance(2500);
  assert.equal(h.count("/deno/resource-monitor"), polls, "Off cancels floating polling");
  await h.setSetting(MODE, "Auto");
  await h.setSetting(CLEANUP, "Auto");
  assert.equal(h.root().parentElement, h.document.body);
  assert.equal(h.root().getBoundingClientRect().left, position.left);
  assert.equal(h.root().getBoundingClientRect().top, position.top);
  assert.equal(h.count("/free"), 0);
}

// New readings can increase the root's width without a viewport resize. The
// monitor re-clamps after unavailable GPU fields become available again.
{
  const h = makeHarness({ settings: { [PLACEMENT]: "Floating" }, metrics: { ...sample, gpus: [] } });
  await h.boot();
  await dragTo(h, { x: 1400, y: 500 });
  const narrowWidth = h.root().getBoundingClientRect().width;
  h.responders.set("/deno/resource-monitor", async () => response(sample));
  await h.advance(1100);
  assert.ok(h.root().getBoundingClientRect().width > narrowWidth, "fixture reflects newly visible GPU meters");
  assertWithinViewport(h, "telemetry width change");
  h.responders.set("/deno/resource-monitor", async () => response({ ...sample, gpus: [] }));
  await h.advance(1100);
  assert.equal(h.root().getBoundingClientRect().width, narrowWidth);
  assertWithinViewport(h, "telemetry fields hide again");
}

// Rotation is a column layout, keeping the reading text upright. Docking is
// horizontal, while returning to floating restores the saved orientation.
{
  const h = makeHarness();
  await h.boot();
  const values = h.meters().map((meter) => meter.querySelector(".deno-resource-value").textContent);
  await h.setSetting(PLACEMENT, "Floating");
  assert.ok(h.rotate() && !h.rotate().hidden);
  const horizontal = h.root().getBoundingClientRect();
  h.rotate().click();
  await h.advance(250);
  const vertical = h.root().getBoundingClientRect();
  assert.ok(vertical.width < horizontal.width && vertical.height > horizontal.height,
    "rotation changes the container from a horizontal row to a vertical column");
  assert.deepEqual(h.meters().map((meter) => meter.querySelector(".deno-resource-value").textContent), values);
  for (const meter of h.meters()) {
    assert.ok(!h.context.getComputedStyle(meter).transform || h.context.getComputedStyle(meter).transform === "none",
      "readings stay upright instead of rotating their contents");
  }
  assert.equal(JSON.parse(h.storage.get(POSITION)).orientation, "vertical");
  assertWithinViewport(h, "rotation clamp");
  await h.resize(600, 300);
  assertWithinViewport(h, "vertical resize clamp");
  await h.setSetting(PLACEMENT, "Top");
  assert.equal(h.root().classList.contains("deno-resource-vertical"), false);
  assert.ok(!h.rotate() || h.rotate().hidden);
  await h.setSetting(PLACEMENT, "Floating");
  assert.equal(h.root().classList.contains("deno-resource-vertical"), true, "floating restores its previously selected direction");
  const restored = makeHarness({ storage: h.storage, settings: Object.fromEntries(h.settingsValues) });
  await restored.boot();
  assert.equal(restored.root().classList.contains("deno-resource-vertical"), true, "reload restores column orientation");
  assert.equal(restored.root().getBoundingClientRect().left, h.root().getBoundingClientRect().left);
  assert.equal(restored.root().getBoundingClientRect().top, h.root().getBoundingClientRect().top);
  restored.rotate().click();
  await restored.advance(250);
  assert.equal(restored.root().classList.contains("deno-resource-vertical"), false);
  assert.equal(JSON.parse(restored.storage.get(POSITION)).orientation, "horizontal");
  assert.equal(restored.count("/free"), 0);
}

// Broken or blocked browser storage cannot leave the monitor offscreen or make
// drag/rotation unusable. Invalid records never become literal NaN/Infinity CSS.
for (const stored of ["not-json", "null", "[]", '{"version":1,"x":null,"y":200}',
  '{"version":1,"x":"NaN","y":200}', '{"version":1,"x":1e309,"y":200}',
  '{"version":2,"x":400,"y":200,"orientation":"vertical"}',
  '{"version":1,"x":400,"y":200,"orientation":"diagonal"}',
  '{"version":1,"x":99999,"y":99999,"orientation":"horizontal"}']) {
  const h = makeHarness({ settings: { [PLACEMENT]: "Floating" }, storage: new Map([[POSITION, stored]]) });
  await h.boot();
  assertWithinViewport(h, "malformed storage recovery");
  await dragTo(h);
  const valid = JSON.parse(h.storage.get(POSITION));
  assert.equal(valid.version, 1);
  assert.ok(Number.isFinite(valid.x) && Number.isFinite(valid.y));
  assert.ok(["horizontal", "vertical"].includes(valid.orientation));
}
{
  const h = makeHarness({ settings: { [PLACEMENT]: "Floating" }, storageBlocked: true });
  await h.boot();
  await dragTo(h);
  h.rotate().click();
  await h.advance(250);
  assertWithinViewport(h, "blocked storage still permits dragging and rotation");
  assert.equal(h.cue(), null);
  assert.equal(h.pointerCaptures.size, 0);
}

// A floating cleanup-only fallback retains Crystools and its telemetry-free
// lifecycle through placement, rotation, cleanup and visibility transitions.
{
  const h = makeHarness({ crystools: "present", settings: { [PLACEMENT]: "Floating" } });
  const originalCrystools = serialize(h.crystoolsRoot);
  await h.boot();
  await dragTo(h);
  h.rotate().click();
  await h.advance(250);
  await h.visibility("hidden");
  await h.visibility("visible");
  assert.equal(h.count("/deno/resource-monitor"), 0);
  assert.equal(serialize(h.crystoolsRoot), originalCrystools);
  assert.equal(h.count("/free"), 0, "placement and rotation do not activate cleanup");
  h.button().click();
  await h.advance(1000);
  assert.equal(h.count("/free"), 1, "the original cleanup action remains usable while floating");
  assert.deepEqual(JSON.parse(h.calls.find((call) => call.url === "/free").options.body), { unload_models: true, free_memory: true });
  assert.equal(h.count("/deno/resource-monitor"), 0);
}

console.log("resource monitor behavior harness passed (20 coexistence combinations, lifecycle, responsive placement, metrics, queue safety, concurrency, floating drag/dock, rotation, persistence)");
