import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "web/js/deno_advanced_image_source_loader.js");

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.dispatched = [];
  }

  addEventListener(type, callback, capture = false) {
    const key = `${type}:${captureFlag(capture)}`;
    const entries = this.listeners.get(key) || [];
    entries.push(callback);
    this.listeners.set(key, entries);
  }

  removeEventListener(type, callback, capture = false) {
    const key = `${type}:${captureFlag(capture)}`;
    const entries = this.listeners.get(key) || [];
    this.listeners.set(key, entries.filter((entry) => entry !== callback));
  }

  emit(type, event, capture = true) {
    for (const callback of [...(this.listeners.get(`${type}:${Boolean(capture)}`) || [])]) {
      callback(event);
    }
  }

  listenerCount(type, capture = true) {
    return (this.listeners.get(`${type}:${Boolean(capture)}`) || []).length;
  }

  dispatchEvent(event) {
    this.dispatched.push(event);
    return true;
  }
}

function captureFlag(value) {
  return typeof value === "object" && value !== null ? Boolean(value.capture) : Boolean(value);
}

class FakeElement extends FakeEventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = String(tagName || "div").toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.style = { cssText: "" };
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.scrollTop = 0;
    this.clientWidth = 800;
    this.offsetWidth = 818;
    this.clientHeight = 260;
  }

  append(...children) {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  appendChild(child) {
    if (child?.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((entry) => entry !== child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.children) {
      child.parentElement = null;
    }
    this.children = [];
    this.append(...children);
  }

  remove() {
    if (!this.parentElement) {
      return;
    }
    this.parentElement.children = this.parentElement.children.filter((entry) => entry !== this);
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  querySelector(selector) {
    const expectedTag = String(selector || "").toUpperCase();
    return walkElements(this).find((element) => element !== this && element.tagName === expectedTag) || null;
  }

  focus() {}

  contains(target) {
    return target === this || walkElements(this).includes(target);
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  get isConnected() {
    if (this === this.ownerDocument?.body) {
      return true;
    }
    return Boolean(this.parentElement?.isConnected);
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement("body", this);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

function walkElements(root) {
  const result = [];
  const visit = (element) => {
    result.push(element);
    for (const child of element.children || []) {
      visit(child);
    }
  };
  visit(root);
  return result;
}

class FakeMouseEvent {
  constructor(type, options = {}) {
    this.type = type;
    Object.assign(this, options);
  }
}

class FakeWheelEvent extends FakeMouseEvent {}

function pointerEvent(overrides = {}) {
  return {
    type: "mousedown",
    button: 1,
    buttons: 4,
    preventDefaultCalls: 0,
    stopPropagationCalls: 0,
    preventDefault() {
      this.preventDefaultCalls += 1;
    },
    stopPropagation() {
      this.stopPropagationCalls += 1;
    },
    ...overrides,
  };
}

let hooks = null;
let responseStatus = 200;
const windowTarget = new FakeEventTarget();
const canvasTarget = new FakeEventTarget();
const documentTarget = new FakeDocument();
windowTarget.__DENO_ADVANCED_IMAGE_SOURCE_TEST_HOOK__ = (registered) => {
  hooks = registered;
};

const context = {
  console,
  MouseEvent: FakeMouseEvent,
  WheelEvent: FakeWheelEvent,
  AbortController,
  URLSearchParams,
  document: documentTarget,
  requestAnimationFrame(callback) {
    callback();
    return 0;
  },
  cancelAnimationFrame() {},
  app: {
    canvas: { canvas: canvasTarget },
    registerExtension() {},
  },
  api: {
    async fetchApi() {
      return {
        status: responseStatus,
        async json() {
          return responseStatus === 200
            ? { path: "", parent: "", folders: [], files: [] }
            : { error: "blocked" };
        },
      };
    },
  },
  window: windowTarget,
};
context.globalThis = context;

let source = fs.readFileSync(scriptPath, "utf8");
source = source.replace(/^import .*;\r?\n/gm, "");
vm.runInNewContext(source, context, { filename: scriptPath });

assert.ok(hooks, "Advanced Image Source Loader did not expose test hooks");

assert.equal(hooks.classifySourceLocation("https://example.com/a.png"), "url");
assert.equal(hooks.classifySourceLocation("C:\\Images\\a.png"), "external");
assert.equal(hooks.classifySourceLocation("\\\\server\\share\\a.png"), "external");
assert.equal(hooks.classifySourceLocation("/home/user/a.png"), "external");
assert.equal(hooks.classifySourceLocation("folder/a.png"), "input");
assert.equal(hooks.getSourceKind("/home/user/a.png"), "Path");
assert.equal(
  hooks.getPreviewUrl("/home/user/a.png"),
  "/deno/advanced/external-image-view?path=%2Fhome%2Fuser%2Fa.png",
);
assert.match(hooks.getPreviewUrl("folder/a.png"), /^\/api\/view\?/);

const previewUrls = Array.from(hooks.inputImagePreviewUrls("folder name/a b.png"));
assert.ok(previewUrls.length >= 4, "input previews must include Comfy-compatible encoding and route fallbacks");
assert.match(previewUrls[0], /^\/api\/view\?/);
assert.ok(previewUrls.some((url) => url.startsWith("/view?")), "input previews must fall back to /view");
const previewImage = { src: "", onerror: null };
let previewExhausted = 0;
hooks.setImagePreviewSources(previewImage, previewUrls, () => {
  previewExhausted += 1;
});
assert.equal(previewImage.src, previewUrls[0]);
previewImage.onerror();
assert.equal(previewImage.src, previewUrls[1], "the first preview failure must try the next URL");
assert.equal(previewExhausted, 0, "a working fallback must not show the Image placeholder");
for (let index = 1; index < previewUrls.length; index += 1) {
  previewImage.onerror();
}
assert.equal(previewExhausted, 1, "the placeholder may appear only after every fallback fails");
assert.equal(previewImage.onerror, null);

assert.deepEqual(Array.from(hooks.resolveAdvancedNodeSize([300, 400])), [520, 620]);
assert.deepEqual(Array.from(hooks.resolveAdvancedNodeSize([840, 900])), [840, 900]);
assert.equal(hooks.shouldApplyAdvancedNodeSize([520, 620], [520, 620]), false);
assert.equal(hooks.shouldApplyAdvancedNodeSize([500, 620], [520, 620]), true);

const hiddenCallback = () => "preserved";
const hiddenWidget = {
  name: "image_paths",
  value: "one.png\ntwo.png",
  callback: hiddenCallback,
  computeSize: () => [320, 80],
};
const widgetOrder = [{ name: "before" }, hiddenWidget, { name: "after" }];
hooks.hideWidget(hiddenWidget);
assert.equal(widgetOrder[1], hiddenWidget, "the serialized widget must stay in its original array slot");
assert.equal(hiddenWidget.value, "one.png\ntwo.png");
assert.equal(hiddenWidget.callback, hiddenCallback);
assert.equal(hiddenWidget.options.hidden, true);
assert.equal(hiddenWidget.hidden, true);
assert.equal(hiddenWidget.type, "hidden");

const conditionalWidget = {
  type: "number",
  hidden: false,
  options: {},
  computeSize: () => [320, 24],
};
hooks.toggleWidgetVisibility(conditionalWidget, false);
assert.equal(conditionalWidget.type, "hidden");
assert.equal(conditionalWidget.options.hidden, true);
hooks.toggleWidgetVisibility(conditionalWidget, true);
assert.equal(conditionalWidget.type, "number");
assert.equal(conditionalWidget.options.hidden, false);
assert.deepEqual(Array.from(conditionalWidget.computeSize()), [320, 24]);

const root = new FakeEventTarget();
const galleryChild = {};
root.contains = (target) => target === root || target === galleryChild;
const gallery = {
  scrollTop: 10,
  clientHeight: 100,
  scrollHeight: 300,
  contains(target) {
    return target === galleryChild;
  },
};
const cleanup = hooks.installMiddleMouseCanvasPan(root, gallery);
assert.equal(root.listenerCount("wheel"), 0);
assert.equal(root.listenerCount("mousedown"), 0);
assert.equal(root.listenerCount("mousemove"), 0);
assert.equal(root.listenerCount("auxclick"), 1);
assert.equal(windowTarget.listenerCount("wheel"), 1);
assert.equal(windowTarget.listenerCount("mousedown"), 1);
assert.equal(windowTarget.listenerCount("mousemove"), 1);
assert.equal(windowTarget.listenerCount("mouseup"), 1);

const localWheel = pointerEvent({
  type: "wheel",
  target: galleryChild,
  deltaX: 0,
  deltaY: 120,
  deltaZ: 0,
  deltaMode: 0,
});
windowTarget.emit("wheel", localWheel);
assert.equal(canvasTarget.dispatched.length, 0, "wheel over the visible gallery remains local scrolling");
assert.equal(gallery.scrollTop, 130);
assert.equal(localWheel.preventDefaultCalls, 1);
assert.equal(localWheel.stopPropagationCalls, 1);

gallery.scrollTop = 200;
const boundaryWheel = pointerEvent({
  type: "wheel",
  target: galleryChild,
  deltaX: 0,
  deltaY: 120,
  deltaZ: 0,
  deltaMode: 0,
});
windowTarget.emit("wheel", boundaryWheel);
assert.equal(canvasTarget.dispatched.length, 1, "wheel at the gallery boundary reaches the ComfyUI canvas");
assert.equal(boundaryWheel.preventDefaultCalls, 1);

const canvasWheel = pointerEvent({
  type: "wheel",
  target: root,
  deltaX: 0,
  deltaY: -120,
  deltaZ: 0,
  deltaMode: 0,
});
windowTarget.emit("wheel", canvasWheel);
assert.equal(canvasTarget.dispatched.length, 2, "wheel outside the gallery reaches the ComfyUI canvas");
assert.equal(canvasTarget.dispatched[1].type, "wheel");
assert.equal(canvasWheel.preventDefaultCalls, 1);
assert.equal(canvasWheel.stopPropagationCalls, 1);

const down = pointerEvent();
down.target = root;
windowTarget.emit("mousedown", down);
assert.equal(canvasTarget.dispatched.length, 3);
assert.equal(down.preventDefaultCalls, 1);
assert.equal(down.stopPropagationCalls, 1);

const move = pointerEvent({ type: "mousemove" });
windowTarget.emit("mousemove", move);
assert.equal(canvasTarget.dispatched.length, 4);

cleanup();
cleanup();
assert.equal(windowTarget.listenerCount("mousedown"), 0);
assert.equal(windowTarget.listenerCount("wheel"), 0);
assert.equal(root.listenerCount("auxclick"), 0);
assert.equal(windowTarget.listenerCount("mousemove"), 0);
assert.equal(windowTarget.listenerCount("mouseup"), 0);
root.emit("mousedown", pointerEvent());
assert.equal(canvasTarget.dispatched.length, 4);

const node = { __denoAdvancedLastExternalRoot: "C:\\Previous" };
await hooks.fetchExternalFolderImagesAndRemember(node, "  /home/user/images  ", "child");
assert.equal(node.__denoAdvancedLastExternalRoot, "/home/user/images");

responseStatus = 500;
await assert.rejects(
  hooks.fetchExternalFolderImagesAndRemember(node, "/failed/root", ""),
  /blocked/,
);
assert.equal(
  node.__denoAdvancedLastExternalRoot,
  "/home/user/images",
  "failed loads must not replace the last successful root",
);

const browserOwner = {};
const browserFiles = Array.from({ length: 500 }, (_, index) => ({
  name: `large-folder/image-${String(index).padStart(3, "0")}.png`,
  display_name: `image-${String(index).padStart(3, "0")}.png`,
}));
const loadBrowserFolder = hooks.showBrowserModal({
  ownerNode: browserOwner,
  title: "Large input folder",
  initialStatus: "Waiting",
  async fetchEntries() {
    return { path: "large-folder", parent: "", folders: [], files: browserFiles };
  },
  getPreviewUrls(entry) {
    return hooks.inputImagePreviewUrls(entry.name);
  },
  getSourceValue(entry) {
    return entry.name;
  },
  setPaths() {},
  getPaths() {
    return [];
  },
  waitForManualLoad: true,
});
await loadBrowserFolder("");

const browserList = walkElements(documentTarget.body).find(
  (element) => element.dataset.denoAdvancedBrowserList === "true",
);
assert.ok(browserList, "the input-folder modal must expose its local scroll viewport");
assert.match(browserList.style.cssText, /overflow-y:\s*auto/);
assert.match(browserList.style.cssText, /scrollbar-gutter:\s*stable/);

let browserCards = walkElements(browserList).filter(
  (element) => element.dataset.denoAdvancedBrowserCard === "true",
);
assert.ok(browserCards.length > 0);
assert.ok(
  browserCards.length < 80,
  `500 entries must render only the viewport and bounded overscan, rendered ${browserCards.length}`,
);
assert.equal(
  walkElements(browserList).filter((element) => element.tagName === "IMG").length,
  browserCards.length,
  "only virtualized cards may create image elements",
);
assert.ok(
  walkElements(browserList)
    .filter((element) => element.tagName === "IMG")
    .every((image) => image.loading === "lazy"),
  "virtualized preview images must stay lazy",
);

const firstBrowserCard = browserCards.find((card) => card.dataset.browserIndex === "0");
assert.ok(firstBrowserCard);
firstBrowserCard.onclick();
assert.equal(firstBrowserCard.getAttribute("aria-pressed"), "true");
browserList.scrollTop = 3000;
browserList.emit("scroll", { target: browserList }, false);
browserCards = walkElements(browserList).filter(
  (element) => element.dataset.denoAdvancedBrowserCard === "true",
);
assert.ok(browserCards.every((card) => Number(card.dataset.browserIndex) > 0));
assert.ok(browserCards.length < 80, "scrolling must keep the DOM window bounded");

browserList.scrollTop = 0;
browserList.emit("scroll", { target: browserList }, false);
browserCards = walkElements(browserList).filter(
  (element) => element.dataset.denoAdvancedBrowserCard === "true",
);
const restoredFirstCard = browserCards.find((card) => card.dataset.browserIndex === "0");
assert.equal(restoredFirstCard?.getAttribute("aria-pressed"), "true", "selection must survive virtual rerenders");
restoredFirstCard.onclick();
assert.equal(restoredFirstCard.getAttribute("aria-pressed"), "false");
browserOwner.__denoCloseAdvancedFolderBrowser();
assert.equal(
  walkElements(documentTarget.body).some((element) => element.dataset.denoAdvancedBrowserList === "true"),
  false,
);

console.log("advanced_image_source_loader_harness passed");
