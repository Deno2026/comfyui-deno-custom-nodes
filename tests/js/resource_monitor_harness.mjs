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
function makeHarness({ crystools = "absent", cleanup = "absent", settings = {}, metrics = sample } = {}) {
  let viewportWidth = 1440;
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
      for (const callback of this.listeners.get(event.type) || []) callback(event);
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
      const descendants = part.trim().split(/\s+(?![^\[]*\])/);
      if (!matchesSimple(element, descendants.pop())) return false;
      let ancestor = element.parentElement;
      while (descendants.length) {
        const wanted = descendants.pop();
        while (ancestor && !matchesSimple(ancestor, wanted)) ancestor = ancestor.parentElement;
        if (!ancestor) return false;
        ancestor = ancestor.parentElement;
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
      const geometry = typeof this.rect === "function" ? this.rect() : this.rect;
      const { x = 100, y = 50, width = this.id === ROOT ? 320 : 30, height = 30 } = geometry || {};
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
  const context = {
    console, document, Element, HTMLElement: Element, Node: Element, AbortController,
    innerWidth: viewportWidth, innerHeight: 900,
    queueMicrotask, URL, URLSearchParams,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.targets = []; this.records = []; observers.add(this); }
      observe(target, options) { this.targets.push({ target, options }); }
      disconnect() { this.targets = []; this.records = []; }
      takeRecords() { return this.records.splice(0); }
    },
    getComputedStyle: (node) => ({ display: node.hidden ? "none" : node.style.display || "flex", visibility: node.style.visibility || "visible", opacity: node.style.opacity || "1" }),
    setTimeout(callback, delay = 0) { const id = nextTimer++; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    app: {
      menu: { element: host, settingsGroup: { element: settingsGroup }, actionsGroup: { element: host } },
      ui: { settings: {
        getSettingValue: (id) => settingsValues.get(id),
        setSettingValue: (id, value) => { settingWrites.push([id, value]); settingsValues.set(id, value); },
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
    document, host, settingsGroup, context, calls, responders, settingWrites, crystoolsRoot, existingCleanup,
    addCrystools, addCleanup, advance,
    emitApi(type, detail) { apiEvents.dispatchEvent({ type, detail }); },
    async resize(width) {
      viewportWidth = width;
      context.innerWidth = width;
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
    [`#${ROOT} .deno-resource-meter:first-child`, { "border-top-left-radius": "4px", "border-bottom-left-radius": "4px" }],
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

console.log("resource monitor behavior harness passed (20 coexistence combinations, lifecycle, responsive placement, metrics, queue safety, concurrency)");
