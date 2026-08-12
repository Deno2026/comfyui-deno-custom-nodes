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
    const key = `${type}:${Boolean(capture)}`;
    const entries = this.listeners.get(key) || [];
    entries.push(callback);
    this.listeners.set(key, entries);
  }

  removeEventListener(type, callback, capture = false) {
    const key = `${type}:${Boolean(capture)}`;
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
windowTarget.__DENO_ADVANCED_IMAGE_SOURCE_TEST_HOOK__ = (registered) => {
  hooks = registered;
};

const context = {
  console,
  MouseEvent: FakeMouseEvent,
  WheelEvent: FakeWheelEvent,
  URLSearchParams,
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

console.log("advanced_image_source_loader_harness passed");
