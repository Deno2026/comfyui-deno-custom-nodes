import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = path.join(repoRoot, "web/js/deno_video_compare.js");

let hooks = null;
let createdElements = 0;
const context = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame() { return 1; },
  cancelAnimationFrame() {},
  queueMicrotask,
  app: { registerExtension() {} },
  api: { addEventListener() {} },
  LiteGraph: {},
  document: {
    createElement() {
      createdElements += 1;
      throw new Error("saved-widget hydration must not rebuild the Video Compare DOM");
    },
  },
};
context.window = context;
context.globalThis = context;
context.__DENO_VIDEO_COMPARE_TEST_HOOK__ = (registered) => {
  hooks = registered;
};

const source = fs.readFileSync(sourcePath, "utf8").replace(/^import .*;\r?\n/gm, "");
vm.runInNewContext(source, context, { filename: "web/js/deno_video_compare.js" });

assert.ok(hooks, "Video Compare should expose its focused test hook");
assert.equal(typeof hooks.frameFrac, "function", "frameFrac should be testable");
assert.equal(typeof hooks.hydrateFromWidgets, "function", "saved-widget hydration should be testable");
assert.equal(typeof hooks.setupNode, "function", "repeat setup should be testable");

function makeFrameNode() {
  return {
    __dvp: {
      dom: {
        stage: {
          getBoundingClientRect() {
            return { left: 100, width: 1000 };
          },
        },
      },
      panX: 0,
      zoom: 1,
    },
  };
}

const frameNode = makeFrameNode();
for (const [fraction, expected] of [
  [-0.1, 0.02],
  [1.2, 0.98],
  [0.993, 0.98],
  [0.37, 0.37],
]) {
  const clientX = 100 + (fraction * 1000);
  assert.equal(
    hooks.frameFrac(frameNode, clientX),
    expected,
    `frameFrac should canonicalize ${fraction} to ${expected}`,
  );
}
assert.equal(hooks.frameFrac(frameNode, Number.NaN), 0.5, "invalid pointer values should use the safe midpoint");

function makeHydrationNode(value) {
  const splitWidget = { name: "split_position", value };
  const state = { split: 0.5, dom: { marker: "existing-dom" } };
  return {
    node: {
      widgets: [splitWidget],
      __dvp: state,
      __dvpSetup: true,
    },
    splitWidget,
    state,
  };
}

for (const [savedValue, expected] of [
  [-0.1, 0.02],
  [1.2, 0.98],
  [0.993, 0.98],
  [Number.NaN, 0.5],
  ["invalid", 0.5],
  [0.37, 0.37],
]) {
  const { node, splitWidget, state } = makeHydrationNode(savedValue);
  hooks.hydrateFromWidgets(node, state);
  assert.equal(state.split, expected, `state should canonicalize saved split_position ${String(savedValue)}`);
  assert.equal(splitWidget.value, expected, `widget should persist canonical split_position ${String(savedValue)}`);
}

const repeated = makeHydrationNode(1.2);
const originalDom = repeated.state.dom;
hooks.setupNode(repeated.node);
assert.equal(repeated.state.split, 0.98, "repeat setup should hydrate the clamped saved value");
assert.equal(repeated.splitWidget.value, 0.98, "repeat setup should persist the clamped widget value");
assert.equal(repeated.state.dom, originalDom, "repeat setup should preserve the existing DOM");

repeated.splitWidget.value = 0.37;
hooks.setupNode(repeated.node);
assert.equal(repeated.state.split, 0.37, "a second hydration should accept an in-range saved value");
assert.equal(repeated.splitWidget.value, 0.37, "state and widget should remain synchronized");
assert.equal(repeated.state.dom, originalDom, "a second hydration should not rebuild the DOM");
assert.equal(createdElements, 0, "saved-widget hydration should not allocate DOM elements");

console.log("video_compare_split_position_harness passed");
