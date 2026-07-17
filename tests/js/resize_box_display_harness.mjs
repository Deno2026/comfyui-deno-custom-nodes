import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "web/js/deno_res_helper.js");

let hooks = null;
const graph = {
  links: {},
  nodes: new Map(),
  getNodeById(id) {
    return this.nodes.get(id) || null;
  },
};

const context = {
  console,
  queueMicrotask(callback) {
    callback();
  },
  app: {
    graph,
    registerExtension() {},
  },
  __DENO_RES_HELPER_TEST_HOOK__(registered) {
    hooks = registered;
  },
};
context.window = context;
context.globalThis = context;

let source = fs.readFileSync(scriptPath, "utf8");
source = source.replace(/^import .*;\r?\n/gm, "");
vm.runInNewContext(source, context, { filename: scriptPath });

assert.ok(hooks, "Resize Box frontend did not expose test hooks");

function makeNode({ connected = false, width = 1001, height = 777 } = {}) {
  const values = {
    mode: "Keep Input Ratio",
    width,
    height,
    ratio_preset: "16:9",
    megapixels: 1,
    divisible_by: 32,
  };
  return {
    inputs: [{ name: "image", link: connected ? 99 : null }],
    widgets: Object.entries(values).map(([name, value]) => ({ name, value })),
  };
}

const disconnected = makeNode();
const disconnectedBefore = JSON.stringify(disconnected.widgets);
const disconnectedInfo = hooks.calculateDisplayInfo(disconnected);
const disconnectedLegacyPreview = hooks.computeKeepInputRatioDims(1001, 777, 1, 32);
assert.deepEqual([disconnectedInfo.width, disconnectedInfo.height], [1024, 800]);
assert.deepEqual(
  [disconnectedInfo.previewWidth, disconnectedInfo.previewHeight],
  Array.from(disconnectedLegacyPreview),
  "disconnected summary correction must preserve the previous preview and drag geometry",
);
const disconnectedPreviewSize = hooks.previewSizeFromDisplayInfo(disconnectedInfo);
assert.deepEqual(
  [disconnectedPreviewSize.width, disconnectedPreviewSize.height],
  Array.from(disconnectedLegacyPreview),
  "drawing and anchor drag must consume the legacy preview geometry",
);
assert.match(disconnectedInfo.text, /^1024 x 800\b/);
assert.doesNotMatch(disconnectedInfo.text, /Input-dependent/);
assert.equal(JSON.stringify(disconnected.widgets), disconnectedBefore);
assert.equal(hooks.getLinkedImageState(disconnected).connected, false);

const knownSource = { id: 7, imgs: [{ naturalWidth: 1920, naturalHeight: 1080 }] };
graph.nodes.set(7, knownSource);
graph.links[99] = { origin_id: 7 };
const known = makeNode({ connected: true });
const knownBefore = JSON.stringify(known.widgets);
const expectedKnown = hooks.computeKeepInputRatioDims(1920, 1080, 1, 32);
const knownInfo = hooks.calculateDisplayInfo(known);
assert.deepEqual([knownInfo.width, knownInfo.height], Array.from(expectedKnown));
assert.deepEqual([knownInfo.previewWidth, knownInfo.previewHeight], Array.from(expectedKnown));
assert.match(knownInfo.text, new RegExp(`^${knownInfo.width} x ${knownInfo.height}\\b`));
assert.doesNotMatch(knownInfo.text, /Input-dependent/);
assert.equal(JSON.stringify(known.widgets), knownBefore);

graph.nodes.set(7, { id: 7 });
const unknown = makeNode({ connected: true });
const unknownBefore = JSON.stringify(unknown.widgets);
const expectedPreview = hooks.computeKeepInputRatioDims(1001, 777, 1, 32);
const unknownInfo = hooks.calculateDisplayInfo(unknown);
assert.deepEqual(
  [unknownInfo.width, unknownInfo.height],
  Array.from(expectedPreview),
  "unknown connections must keep the previous fallback preview geometry",
);
assert.deepEqual([unknownInfo.previewWidth, unknownInfo.previewHeight], Array.from(expectedPreview));
assert.equal(unknownInfo.text, "Input-dependent  |  target 1.00 MP  |  divisible by 32");
assert.doesNotMatch(unknownInfo.text, /^\d+ x \d+/);
assert.equal(JSON.stringify(unknown.widgets), unknownBefore);
const unknownState = hooks.getLinkedImageState(unknown);
assert.equal(unknownState.connected, true);
assert.equal(unknownState.size, null);

delete graph.links[99];
const staleLinkInfo = hooks.calculateDisplayInfo(makeNode({ connected: true }));
assert.match(staleLinkInfo.text, /Input-dependent/);

console.log("resize_box_display_harness passed");
