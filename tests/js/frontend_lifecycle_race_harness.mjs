import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadHooks(relativePath, hookName, overrides = {}) {
  let hooks = null;
  const context = {
    console,
    AbortController,
    URL,
    URLSearchParams,
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
    ...overrides,
  };
  context.window = context;
  context.globalThis = context;
  context[hookName] = (registered) => {
    hooks = registered;
  };

  const source = readSource(relativePath).replace(/^import .*;\r?\n/gm, "");
  vm.runInNewContext(source, context, { filename: relativePath });
  assert.ok(hooks, `${relativePath} did not expose ${hookName}`);
  return hooks;
}

function loadExtension(relativePath, overrides = {}) {
  let extension = null;
  const context = {
    console,
    AbortController,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    queueMicrotask,
    app: {
      registerExtension(registered) {
        extension = registered;
      },
    },
    api: { addEventListener() {} },
    LiteGraph: {},
    ...overrides,
  };
  context.window = context;
  context.globalThis = context;
  const source = readSource(relativePath).replace(/^import .*;\r?\n/gm, "");
  vm.runInNewContext(source, context, { filename: relativePath });
  assert.ok(extension, `${relativePath} did not register an extension`);
  return extension;
}

function assertLatestRequestGate(createGate, label) {
  const gate = createGate();
  const first = gate.start();
  assert.equal(first.signal.aborted, false, `${label}: first request should start active`);
  assert.equal(first.isCurrent(), true, `${label}: first request should be current`);

  const second = gate.start();
  assert.equal(first.signal.aborted, true, `${label}: a newer request must abort the previous request`);
  assert.equal(first.isCurrent(), false, `${label}: the previous request must become stale`);
  assert.equal(second.isCurrent(), true, `${label}: the newest request should remain current`);

  gate.dispose();
  assert.equal(second.signal.aborted, true, `${label}: disposal must abort the active request`);
  assert.equal(second.isCurrent(), false, `${label}: disposal must invalidate the active request`);
}

const extraHooks = loadHooks("web/js/deno_extra_nodes.js", "__DENO_EXTRA_NODES_TEST_HOOK__");
assertLatestRequestGate(extraHooks.createLatestRequestGate, "Multi Image folder browser");

const advancedHooks = loadHooks(
  "web/js/deno_advanced_image_source_loader.js",
  "__DENO_ADVANCED_IMAGE_SOURCE_TEST_HOOK__",
);
assertLatestRequestGate(advancedHooks.createLatestRequestGate, "Advanced Image folder browser");

let downloaderExtension = null;
const downloaderHooks = loadHooks(
  "web/js/deno_ltx_model_downloader.js",
  "__DENO_LTX_MODEL_DOWNLOADER_TEST_HOOK__",
  {
    app: {
      registerExtension(extension) {
        downloaderExtension = extension;
      },
    },
  },
);
assertLatestRequestGate(downloaderHooks.createLatestRequestGate, "LTX Model Downloader refresh");
assert.ok(downloaderExtension, "LTX Model Downloader extension should register");
class FakeDownloaderNode {}
let originalRemovedCalls = 0;
FakeDownloaderNode.prototype.onRemoved = function () {
  originalRemovedCalls += 1;
  return "removed";
};
await downloaderExtension.beforeRegisterNodeDef(FakeDownloaderNode, { name: "DenoLTXModelDownloader" });
const downloaderNode = new FakeDownloaderNode();
let disposeCalls = 0;
downloaderNode.__denoLtxSetupUi = { dispose() { disposeCalls += 1; } };
downloaderNode.__denoLtxSetupReady = true;
assert.equal(downloaderNode.onRemoved(), "removed", "node removal should preserve the original callback result");
assert.equal(disposeCalls, 1, "node removal should dispose the downloader UI exactly once");
assert.equal(originalRemovedCalls, 1, "node removal should still call the original lifecycle callback");
assert.equal(downloaderNode.__denoLtxSetupUi, null, "node removal should release the UI reference");
assert.equal(downloaderNode.__denoLtxSetupDisposed, true, "node removal should block queued setup work");

let nextTimerId = 1;
const intervals = new Map();
const timeouts = new Map();
const cancelledFrames = [];
let videoExtension = null;
const videoHooks = loadHooks("web/js/deno_video_compare.js", "__DENO_VIDEO_COMPARE_TEST_HOOK__", {
  app: {
    registerExtension(extension) {
      videoExtension = extension;
    },
  },
  setInterval(callback) {
    const id = nextTimerId++;
    intervals.set(id, callback);
    return id;
  },
  clearInterval(id) {
    intervals.delete(id);
  },
  setTimeout(callback) {
    const id = nextTimerId++;
    timeouts.set(id, callback);
    return id;
  },
  clearTimeout(id) {
    timeouts.delete(id);
  },
  cancelAnimationFrame(id) {
    cancelledFrames.push(id);
  },
});

const state = {
  beginRun: 0,
  beginInterval: null,
  beginTimeout: null,
  destroyed: false,
};
let beginCalls = 0;
const firstFrame = { ready: false };
videoHooks.schedulePlaybackBegin(state, firstFrame, () => { beginCalls += 1; });
const readyCallback = intervals.get(state.beginInterval);
const fallbackCallback = timeouts.get(state.beginTimeout);
assert.equal(typeof readyCallback, "function", "Video Compare should poll for its first decoded frame");
assert.equal(typeof fallbackCallback, "function", "Video Compare should retain its 1.5 second fallback");

firstFrame.ready = true;
readyCallback();
assert.equal(beginCalls, 1, "first-frame readiness should begin playback once");
assert.equal(state.beginInterval, null, "successful begin should clear the polling interval");
assert.equal(state.beginTimeout, null, "successful begin should clear the fallback timeout");
fallbackCallback();
assert.equal(beginCalls, 1, "a stale fallback callback must not begin playback twice");

const staleFrame = { ready: false };
videoHooks.schedulePlaybackBegin(state, staleFrame, () => { beginCalls += 10; });
const staleInterval = intervals.get(state.beginInterval);
const staleTimeout = timeouts.get(state.beginTimeout);
const latestFrame = { ready: false };
videoHooks.schedulePlaybackBegin(state, latestFrame, () => { beginCalls += 1; });
const latestTimeout = timeouts.get(state.beginTimeout);
staleFrame.ready = true;
staleInterval();
staleTimeout();
assert.equal(beginCalls, 1, "callbacks from an older execution must not affect newer output");
latestTimeout();
assert.equal(beginCalls, 2, "the newest execution fallback should begin exactly once");

const cancelledFrame = { ready: false };
videoHooks.schedulePlaybackBegin(state, cancelledFrame, () => { beginCalls += 100; });
const cancelledInterval = intervals.get(state.beginInterval);
videoHooks.cancelPendingPlaybackBegin(state);
cancelledFrame.ready = true;
cancelledInterval();
assert.equal(beginCalls, 2, "node cleanup must invalidate already queued playback callbacks");

assert.ok(videoExtension, "Video Compare extension should register");
class FakeVideoCompareNode {}
let videoOriginalRemovedCalls = 0;
FakeVideoCompareNode.prototype.onRemoved = function () {
  videoOriginalRemovedCalls += 1;
  return "video removed";
};
await videoExtension.beforeRegisterNodeDef(FakeVideoCompareNode, { name: "DenoVideoCompare" });
const removalState = {
  beginRun: 0,
  beginInterval: null,
  beginTimeout: null,
  destroyed: false,
  playing: true,
  transientCleanups: new Set(),
  raf: 777,
  audioController: null,
  audioRun: 0,
  srcA: null,
  srcB: null,
  actx: null,
  master: {},
  gA: {},
  gB: {},
  bufA: {},
  bufB: {},
  cache: new Map([["frame", { img: { src: "frame.webp" } }]]),
  dom: null,
};
videoHooks.schedulePlaybackBegin(removalState, { ready: false }, () => {});
let interactionCleanupCalls = 0;
removalState.transientCleanups.add(() => { interactionCleanupCalls += 1; });
let audioAbortCalls = 0;
let audioCloseCalls = 0;
removalState.audioController = { abort() { audioAbortCalls += 1; } };
removalState.actx = { close() { audioCloseCalls += 1; } };
const videoNode = new FakeVideoCompareNode();
videoNode.__dvp = removalState;
assert.equal(videoNode.onRemoved(), "video removed", "Video Compare should preserve its original removal result");
assert.equal(videoOriginalRemovedCalls, 1, "Video Compare should still call its original removal callback");
assert.equal(removalState.destroyed, true, "Video Compare removal should mark the state destroyed");
assert.equal(removalState.playing, false, "Video Compare removal should stop playback");
assert.equal(removalState.beginInterval, null, "Video Compare removal should clear first-frame polling");
assert.equal(removalState.beginTimeout, null, "Video Compare removal should clear the first-frame fallback");
assert.equal(interactionCleanupCalls, 1, "Video Compare removal should clear window-level drag handlers");
assert.equal(audioAbortCalls, 1, "Video Compare removal should abort audio loading");
assert.equal(audioCloseCalls, 1, "Video Compare removal should close its audio context");
assert.equal(removalState.bufA, null, "Video Compare removal should release decoded A audio");
assert.equal(removalState.bufB, null, "Video Compare removal should release decoded B audio");
assert.equal(removalState.cache.size, 0, "Video Compare removal should release cached frames");
assert.ok(cancelledFrames.includes(777), "Video Compare removal should cancel its animation frame");

const extraSource = readSource("web/js/deno_extra_nodes.js");
assert.match(extraSource, /__denoCloseInputFolderBrowser\?\.\(\)/);
assert.match(extraSource, /fetchInputFolderImages\(nextPath, request\.signal\)/);
assert.match(extraSource, /this\.__denoCloseInputFolderBrowser = null/);

const advancedSource = readSource("web/js/deno_advanced_image_source_loader.js");
assert.match(advancedSource, /ownerNode\?\.__denoCloseAdvancedFolderBrowser\?\.\(\)/);
assert.match(advancedSource, /options\.fetchEntries\(folderPath, request\.signal\)/);
assert.match(advancedSource, /this\.__denoCloseAdvancedFolderBrowser = null/);
assert.match(advancedSource, /showSourceTextDialog\(node, setPaths, getPaths\)/);

const videoSource = readSource("web/js/deno_video_compare.js");
assert.match(videoSource, /stopDetachedVideoCompare\(node, s\)/);
assert.match(videoSource, /state\.audioController\?\.abort\(\)/);
assert.match(videoSource, /clearTransientInteractions\(state\)/);

const downloaderSource = readSource("web/js/deno_ltx_model_downloader.js");
assert.match(downloaderSource, /document\.removeEventListener\("click", onDocumentClick\)/);
assert.match(downloaderSource, /observer\.disconnect\(\)/);
assert.match(downloaderSource, /cancelAnimationFrame\(layoutFrame\)/);
assert.doesNotMatch(downloaderSource, /document\.addEventListener\("click", \(\) =>/);

async function assertLoraRemovalLifecycle(relativePath, nodeName, prefix) {
  const extension = loadExtension(relativePath);
  class FakeNode {}
  let originalRemovedCalls = 0;
  FakeNode.prototype.onRemoved = function () {
    originalRemovedCalls += 1;
    return `${prefix} removed`;
  };
  await extension.beforeRegisterNodeDef(FakeNode, { name: nodeName });
  const node = new FakeNode();
  let menuCloseCalls = 0;
  let menuRootRemoveCalls = 0;
  let infoCloseCalls = 0;
  node[`__deno${prefix}ContextMenu`] = {
    close() { menuCloseCalls += 1; },
    root: { remove() { menuRootRemoveCalls += 1; } },
  };
  node[`__deno${prefix}InfoClose`] = () => { infoCloseCalls += 1; };
  const result = node.onRemoved();
  assert.equal(result, `${prefix} removed`, `${prefix}: preserve original onRemoved result`);
  assert.equal(originalRemovedCalls, 1, `${prefix}: preserve original onRemoved call`);
  assert.equal(menuCloseCalls, 1, `${prefix}: close the owned ContextMenu`);
  assert.equal(menuRootRemoveCalls, 1, `${prefix}: remove the owned ContextMenu root`);
  assert.equal(infoCloseCalls, 1, `${prefix}: close the owned Info editor`);
  assert.equal(node[`__deno${prefix}Removed`], true, `${prefix}: mark node removed`);
}

await assertLoraRemovalLifecycle(
  "web/js/deno_multi_lora.js",
  "DenoMultiLoraLoader",
  "MultiLora",
);
await assertLoraRemovalLifecycle(
  "web/js/deno_ltx_multi_lora.js",
  "DenoLTXMultiLoraLoader",
  "LtxMultiLora",
);

const genericLoraSource = readSource("web/js/deno_multi_lora.js");
assert.match(genericLoraSource, /generation !== node\.__denoMultiLoraChooserGeneration/);
assert.match(genericLoraSource, /node\.__denoMultiLoraInfoClose\?\.\(\)/);
const ltxLoraSource = readSource("web/js/deno_ltx_multi_lora.js");
assert.match(ltxLoraSource, /generation !== node\.__denoLtxMultiLoraChooserGeneration/);
assert.match(ltxLoraSource, /node\.__denoLtxMultiLoraInfoClose\?\.\(\)/);

const previewExtension = loadExtension("web/js/deno_video_preview.js");
class FakePreviewNode {}
let previewOriginalRemovedCalls = 0;
FakePreviewNode.prototype.onRemoved = function () {
  previewOriginalRemovedCalls += 1;
  return "preview removed";
};
await previewExtension.beforeRegisterNodeDef(FakePreviewNode, { name: "DenoVideoPreview" });
const previewNode = new FakePreviewNode();
let previewPanCleanupCalls = 0;
previewNode.__dvprev = { panCleanup() { previewPanCleanupCalls += 1; } };
assert.equal(previewNode.onRemoved(), "preview removed");
assert.equal(previewOriginalRemovedCalls, 1);
assert.equal(previewPanCleanupCalls, 1, "Video Preview should clear active window pan listeners");
assert.equal(previewNode.__dvprev.panCleanup, null);

const berniniExtension = loadExtension("web/js/deno_bernini_prompt_guide.js");
class FakeBerniniNode {}
let berniniOriginalRemovedCalls = 0;
FakeBerniniNode.prototype.onRemoved = function () {
  berniniOriginalRemovedCalls += 1;
  return "bernini removed";
};
await berniniExtension.beforeRegisterNodeDef(FakeBerniniNode, { name: "DenoBerniniPromptGuide" });
const berniniNode = new FakeBerniniNode();
let berniniCloseCalls = 0;
berniniNode.__denoBerniniTaskInfoClose = () => { berniniCloseCalls += 1; };
assert.equal(berniniNode.onRemoved(), "bernini removed");
assert.equal(berniniOriginalRemovedCalls, 1);
assert.equal(berniniCloseCalls, 1, "Bernini removal should close its Info panel");
assert.equal(berniniNode.__denoBerniniTaskInfoClose, null);
const berniniSource = readSource("web/js/deno_bernini_prompt_guide.js");
assert.match(berniniSource, /existing\?\.__denoClose/);
assert.match(berniniSource, /clearTimeout\(listenerTimer\)/);

console.log("frontend_lifecycle_race_harness passed");
