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

const root = new FakeEventTarget();
const cleanup = hooks.installMiddleMouseCanvasPan(root);
assert.equal(root.listenerCount("mousedown"), 1);
assert.equal(root.listenerCount("mousemove"), 1);
assert.equal(root.listenerCount("auxclick"), 1);
assert.equal(windowTarget.listenerCount("mousemove"), 1);
assert.equal(windowTarget.listenerCount("mouseup"), 1);

const down = pointerEvent();
root.emit("mousedown", down);
assert.equal(canvasTarget.dispatched.length, 1);
assert.equal(down.preventDefaultCalls, 1);
assert.equal(down.stopPropagationCalls, 1);

const move = pointerEvent({ type: "mousemove" });
windowTarget.emit("mousemove", move);
assert.equal(canvasTarget.dispatched.length, 2);

cleanup();
cleanup();
assert.equal(root.listenerCount("mousedown"), 0);
assert.equal(root.listenerCount("mousemove"), 0);
assert.equal(root.listenerCount("auxclick"), 0);
assert.equal(windowTarget.listenerCount("mousemove"), 0);
assert.equal(windowTarget.listenerCount("mouseup"), 0);
root.emit("mousedown", pointerEvent());
assert.equal(canvasTarget.dispatched.length, 2);

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
