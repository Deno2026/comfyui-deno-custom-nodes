import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const noop = () => {};

// Run the registered production extensions with only browser/ComfyUI boundaries faked.
class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    const entries = this.listeners.get(type) || [];
    entries.push(callback);
    this.listeners.set(type, entries);
  }
  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry !== callback));
  }
  dispatch(type, options = {}) {
    const event = {
      type, target: this, button: 0, clientX: 0, clientY: 0, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation: noop, stopImmediatePropagation: noop,
      dataTransfer: { setData: noop }, ...options,
    };
    this[`on${type}`]?.(event);
    for (const callback of [...(this.listeners.get(type) || [])]) callback(event);
    return event;
  }
}

function matches(element, selector) {
  const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
  if (attribute) {
    const [_, name, expected] = attribute;
    const value = element.getAttribute(name);
    return value !== null && (expected === undefined || value === expected);
  }
  return element.tagName === selector.toUpperCase();
}

class FakeElement extends FakeEventTarget {
  constructor(tag, document) {
    super();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.parentElement = null;
    this.style = { cssText: "" };
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = "";
    this.clientWidth = this.offsetWidth = 120;
    this.clientHeight = this.offsetHeight = 100;
    this.scrollTop = 0;
  }
  append(...children) { for (const child of children) this.appendChild(child); }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, reference) {
    if (child === reference) return child;
    child.remove();
    const index = reference === null ? this.children.length : this.children.indexOf(reference);
    assert.ok(index >= 0, "insertBefore reference must belong to its parent");
    this.children.splice(index, 0, child);
    child.parentElement = this;
    return child;
  }
  replaceChildren(...children) {
    for (const child of [...this.children]) child.remove();
    this.append(...children);
  }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) {
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return Object.hasOwn(this.dataset, key) ? String(this.dataset[key]) : null;
    }
    return this.attributes.get(name) ?? null;
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(matches(child, selector) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(target) { return target === this || this.children.some((child) => child.contains(target)); }
  focus() {}
  click() { return this.dispatch("click"); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 120, height: 100 }; }
  get nextSibling() {
    const siblings = this.parentElement?.children || [];
    return siblings[siblings.indexOf(this) + 1] || null;
  }
  get firstElementChild() { return this.children[0] || null; }
  get isConnected() { return this === this.ownerDocument.body || Boolean(this.parentElement?.isConnected); }
}

class FakeDocument extends FakeEventTarget {
  constructor() { super(); this.body = new FakeElement("body", this); }
  createElement(tag) { return new FakeElement(tag, this); }
}

const cases = [
  { name: "standard", nodeType: "DenoMultiImageLoader", script: "deno_extra_nodes.js" },
  { name: "H3", nodeType: "DenoMiniMaxH3ReferenceImageLoader", script: "deno_extra_nodes.js" },
  { name: "Advanced", nodeType: "DenoAdvancedImageSourceLoader", script: "deno_advanced_image_source_loader.js" },
];

async function createRuntime(spec) {
  const timers = new Map();
  const frames = new Map();
  let timerId = 0;
  let now = 1_000;
  const document = new FakeDocument();
  const window = new FakeEventTarget();
  const notifications = [];
  const measuredPaths = [];
  const sequencer = { id: 2, type: "DenoLTXSequencer", _syncImageCount: (count) => notifications.push(count) };
  const graph = {
    links: { 1: { target_id: 2 } }, getNodeById: () => sequencer, setDirtyCanvas: noop,
  };
  const extensions = [];
  const context = {
    console, URL, URLSearchParams, AbortController,
    Date: class extends Date { static now() { return now; } },
    document, window,
    app: { graph, canvas: { canvas: new FakeEventTarget(), selected_nodes: {} },
      registerExtension: (extension) => extensions.push(extension) },
    api: { apiURL: (value) => value },
    Image: class {
      set src(value) {
        const filename = new URL(value, "http://localhost").searchParams.get("filename");
        measuredPaths.push(filename);
        [this.naturalWidth, this.naturalHeight] = filename === "b.png" ? [640, 1280] : [1280, 640];
        this.onload?.();
      }
    },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { const id = ++timerId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    getComputedStyle: () => ({ width: "120px" }),
  };
  Object.assign(window, { setTimeout: context.setTimeout, clearTimeout: context.clearTimeout });
  const filename = path.join(repoRoot, "web/js", spec.script);
  const source = fs.readFileSync(filename, "utf8").replace(/^import .*;\r?\n/gm, "");
  vm.runInNewContext(source, context, { filename });

  class LoaderNode {
    constructor(paths, disabled, withDisabledWidget) {
      this.id = 1;
      this.type = spec.nodeType;
      this.comfyClass = spec.nodeType;
      this.size = [520, 620];
      this.properties = {};
      this.graph = graph;
      this.outputs = [{ links: [1] }];
      this.widgets = [
        { name: "image_paths", value: paths.join("\n") },
        { name: "mode", value: "Keep Input Ratio" },
        { name: "ratio_preset", value: "16:9" },
        { name: "megapixels", value: 1 },
        { name: "divisible_by", value: 32 },
        { name: "width", value: 1024 },
        { name: "height", value: 1024 },
      ];
      if (withDisabledWidget) this.widgets.push({ name: "disabled_image_paths", value: disabled.join("\n") });
      this.initialWidgets = [...this.widgets];
    }
    setDirtyCanvas() {}
    setSize(size) { this.size = size; }
    addDOMWidget(name, type, element, options) {
      this.panel = element;
      document.body.appendChild(element);
      const widget = { name, type, element, options };
      this.widgets.push(widget);
      return widget;
    }
  }
  for (const extension of extensions) await extension.beforeRegisterNodeDef?.(LoaderNode, { name: spec.nodeType });

  async function flush() {
    for (let pass = 0; pass < 8; pass += 1) {
      const callbacks = [...timers.values(), ...frames.values()];
      timers.clear(); frames.clear();
      for (const callback of callbacks) callback();
      await Promise.resolve();
    }
    now += 500;
  }
  async function create(paths, disabled = [], withDisabledWidget = true) {
    const node = new LoaderNode(paths, disabled, withDisabledWidget);
    node.onNodeCreated();
    await flush();
    assert.deepEqual(node.widgets.slice(0, node.initialWidgets.length), node.initialWidgets,
      `${spec.name}: hiding fields must preserve every serialized widget slot`);
    return node;
  }
  return { create, flush, notifications, measuredPaths };
}

const widget = (node, name) => node.widgets.find((entry) => entry.name === name);
const cards = (node) => node.panel.querySelectorAll("[data-path]");
const card = (node, path) => cards(node).find((entry) => entry.dataset.path === path);
const savedPaths = (node, name = "image_paths") => String(widget(node, name)?.value || "").split("\n").filter(Boolean);

function assertCards(node, expectedPaths, expectedIndices, label) {
  const visible = cards(node);
  assert.deepEqual(visible.map((entry) => entry.dataset.path), expectedPaths, `${label}: source order`);
  assert.deepEqual(visible.map((entry) => entry.querySelector("[data-deno-output-index]")?.textContent),
    expectedIndices, `${label}: enabled cards must have contiguous output numbers`);
  for (const [index, entry] of visible.entries()) {
    const disabled = expectedIndices[index] === "";
    assert.equal(entry.dataset.denoDisabled, String(disabled), `${label}: disabled card state`);
    assert.equal(entry.getAttribute("aria-pressed"), String(!disabled), `${label}: accessible enabled state`);
    const badge = entry.querySelector("[data-deno-output-index]");
    assert.ok(badge, `${label}: output index badge exists`);
    assert.equal(badge.style.display === "none" || badge.hidden === true, disabled, `${label}: disabled number is hidden`);
    const pill = entry.querySelector("[data-deno-disabled-pill]");
    assert.ok(pill, `${label}: disabled label exists`);
    assert.equal(pill.style.display === "none", !disabled, `${label}: disabled label visibility`);
  }
}

async function reorderBefore(runtime, node, sourcePath, targetPath) {
  const source = card(node, sourcePath);
  const target = card(node, targetPath);
  source.dispatch("dragstart");
  await runtime.flush();
  target.dispatch("dragover", { clientX: 0, clientY: 0 });
  source.dispatch("dragend");
  await runtime.flush();
}

for (const spec of cases) {
  const runtime = await createRuntime(spec);
  const node = await runtime.create(["a.png", "b.png", "c.png", "d.png"], ["b.png"]);
  const label = spec.name;
  assertCards(node, ["a.png", "b.png", "c.png", "d.png"], ["1", "", "2", "3"], `${label} initial`);
  assert.equal(widget(node, "disabled_image_paths").hidden, true, `${label}: saved disabled list must stay hidden`);
  if (label !== "Advanced") assert.equal(node._denoImageCount, 3, `${label}: only enabled sources count`);
  if (label === "standard") assert.equal(runtime.notifications.at(-1), 3);

  const originalCards = cards(node);
  card(node, "a.png").click();
  await runtime.flush();
  assert.deepEqual(cards(node), originalCards, `${label}: toggling must update existing cards in place`);
  assertCards(node, ["a.png", "b.png", "c.png", "d.png"], ["", "", "1", "2"], `${label} disable first`);
  assert.deepEqual(new Set(savedPaths(node, "disabled_image_paths")), new Set(["a.png", "b.png"]));
  if (label === "standard") assert.equal(runtime.notifications.at(-1), 2);

  card(node, "b.png").click();
  await runtime.flush();
  assertCards(node, ["a.png", "b.png", "c.png", "d.png"], ["", "1", "2", "3"], `${label} reenable middle`);
  if (label === "standard") {
    assert.equal(runtime.measuredPaths.at(-1), "b.png", "output size must use the first enabled source");
    assert.ok(node.__denoOutputImageSize.width < node.__denoOutputImageSize.height,
      "first enabled portrait reference must replace the disabled landscape size hint");
  }

  for (const imagePath of ["b.png", "c.png", "d.png"]) card(node, imagePath).click();
  await runtime.flush();
  assertCards(node, ["a.png", "b.png", "c.png", "d.png"], ["", "", "", ""], `${label} all disabled`);
  assert.ok(node.panel.children[0].children.some((element) => /0\s*\/\s*4.*enabled/.test(element.textContent)),
    `${label}: all-disabled count must be visible as zero enabled`);
  if (label !== "Advanced") assert.equal(node._denoImageCount, 0);
  if (label === "standard") assert.equal(runtime.notifications.at(-1), 0);
  if (label === "H3") assert.equal(runtime.notifications.length, 0, "H3 must not drive LTX sequencer counts");

  card(node, "a.png").click();
  card(node, "c.png").click();
  await runtime.flush();
  await reorderBefore(runtime, node, "c.png", "a.png");
  assertCards(node, ["c.png", "a.png", "b.png", "d.png"], ["1", "2", "", ""], `${label} reorder`);
  assert.deepEqual(savedPaths(node), ["c.png", "a.png", "b.png", "d.png"]);
  assert.deepEqual(new Set(savedPaths(node, "disabled_image_paths")), new Set(["b.png", "d.png"]));

  card(node, "b.png").querySelector("button").click();
  await runtime.flush();
  assertCards(node, ["c.png", "a.png", "d.png"], ["1", "2", ""], `${label} remove disabled`);
  assert.deepEqual(savedPaths(node, "disabled_image_paths"), ["d.png"], "removal must prune disabled state");
  card(node, "c.png").querySelector("button").click();
  await runtime.flush();
  assertCards(node, ["a.png", "d.png"], ["1", ""], `${label} remove enabled`);

  const reopened = await runtime.create(savedPaths(node), savedPaths(node, "disabled_image_paths"));
  assertCards(reopened, ["a.png", "d.png"], ["1", ""], `${label} save/reopen`);
  if (label !== "Advanced") {
    widget(reopened, "image_paths").value = "x.png\ny.png";
    widget(reopened, "disabled_image_paths").value = "x.png";
    reopened.onDrawBackground?.();
    await runtime.flush();
    assertCards(reopened, ["x.png", "y.png"], ["", "1"], `${label} same-count replacement`);
    widget(reopened, "disabled_image_paths").value = "y.png";
    reopened.onDrawBackground?.();
    await runtime.flush();
    assertCards(reopened, ["x.png", "y.png"], ["1", ""], `${label} same-count enabled swap`);
    widget(reopened, "image_paths").value = "y.png\nx.png";
    reopened.onDrawBackground?.();
    await runtime.flush();
    assertCards(reopened, ["y.png", "x.png"], ["", "1"], `${label} same-count restored order`);
  }

  node.panel.querySelectorAll("button").find((button) => button.textContent === "Clear").click();
  await runtime.flush();
  assert.deepEqual(cards(node), [], `${label}: clear must remove all cards`);
  assert.deepEqual(savedPaths(node), []);
  assert.deepEqual(savedPaths(node, "disabled_image_paths"), [], `${label}: clear must remove disabled paths`);

  const oldWorkflow = await runtime.create(["legacy-one.png", "legacy-two.png"], [], false);
  assertCards(oldWorkflow, ["legacy-one.png", "legacy-two.png"], ["1", "2"], `${label} legacy workflow`);
  if (label === "Advanced") {
    const sourceUrl = "https://images.example.com/image?sig=a%2Bb&expires=5";
    const quotedPath = '"C:\\Images\\a.png"';
    const previewNode = await runtime.create([sourceUrl, "/external/image.png", "a.png", quotedPath], [sourceUrl]);
    const previousValues = previewNode.widgets.map((entry) => entry.value);
    const originalImage = card(previewNode, sourceUrl).querySelector("img");
    assert.match(originalImage.src, /^\/deno\/advanced\/remote-image-preview\?/);
    originalImage.onerror();
    const failedPreview = card(previewNode, sourceUrl).children[0];
    assert.match(failedPreview.textContent, /preview unavailable/,
      "a failed URL thumbnail must show an explicit failure, not just the URL source kind");
    assert.match(failedPreview.title, /Refresh previews/);
    previewNode.panel.querySelectorAll("button").find((button) => button.textContent === "Refresh previews").click();
    await runtime.flush();
    assert.deepEqual(previewNode.widgets.map((entry) => entry.value), previousValues,
      "retry must preserve all serialized settings, source order and enable state");
    assertCards(previewNode, [sourceUrl, "/external/image.png", "a.png", quotedPath], ["", "1", "2", "3"], "Advanced refresh previews");
    const retryImage = card(previewNode, sourceUrl).querySelector("img");
    assert.notEqual(retryImage.src, originalImage.src, "retry must bypass a browser-cached failed response");
    const retryParams = new URL(retryImage.src, "http://localhost").searchParams;
    assert.equal(retryParams.get("url"), sourceUrl, "retry must not rewrite a signed remote URL");
    assert.ok(retryParams.get("_deno_preview"));
    assert.match(card(previewNode, "/external/image.png").querySelector("img").src, /_deno_preview=/,
      "retry must also refresh external files that changed on disk");
    const quotedPreview = new URL(card(previewNode, quotedPath).querySelector("img").src, "http://localhost");
    assert.equal(quotedPreview.pathname, "/deno/advanced/external-image-view");
    assert.equal(quotedPreview.searchParams.get("path"), "C:\\Images\\a.png",
      "preview must accept Explorer quotes while the original stored string stays unchanged");
    previewNode.onRemoved?.();
  }
  for (const current of [node, reopened, oldWorkflow]) current.onRemoved?.();
}

console.log("image_loader_enabled_harness passed");
