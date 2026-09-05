import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(root, "web/js", name), "utf8").replace(/^import[^\n]*\n/gm, "");
const noop = () => {};
const plain = (value) => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function section(source, start, end) {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin, `Missing source section: ${start}`);
  return source.slice(begin, finish);
}

// Actual translation/snapshot functions, with transport and repaint dependencies stubbed.
const directorSource = read("deno_ideogram_director.js");
const translationFunctions = [
  section(directorSource, "        function snapshot(", "        function commit("),
  section(directorSource, "        function viewTranslationState(", "        async function translateCaptionToEnglishForOutput("),
  section(directorSource, "        async function translateBoardToViewLanguage(", "        async function refreshBoardTranslation("),
].join("\n");
function translationContext() {
  const request = deferred();
  const widgets = { width: 1024, height: 1024, aspect_ratio: "1:1", include_aspect_ratio: true };
  const context = {
    console, viewTranslateSeq: 0, VIEW_DEFAULT: "Original", target: "Korean",
    boxes: [{ id: 1, desc: "before", x: 0.1, enabled: false }], selectedId: 1,
    stylePalette: [], styleMode: "photo", bdropDim: 0, resultDim: 0, bdT: {}, railWide: false,
    summary: { value: "summary" }, bgArea: { value: "background" }, aesIn: { value: "aesthetic" },
    ligIn: { value: "lighting" }, medIn: { value: "medium" }, photoIn: { value: "photo" }, artIn: { value: "" },
    getViewLanguage: () => context.target, normalizeViewLanguage: (value) => value,
    getW: (name) => widgets[name], paintTranslate: noop,
    translateBtn: { textContent: "Language", classList: { add: noop } },
    assembleCaption: () => ({ boxes: plain(context.boxes) }),
    translateCaptionViaRoute: () => request.promise, withCurrentUiColors: (value) => value,
    applyImportedCaption: (value) => { context.boxes = value.boxes; context.applied += 1; },
    renderBoxes: noop, renderPalette: noop, renderElements: noop, layoutStage: noop, serialize: noop,
    applied: 0, widgets,
  };
  vm.createContext(context);
  vm.runInContext(translationFunctions, context);
  return { context, request };
}
for (const [label, edit] of [
  ["description", (c) => { c.boxes[0].desc = "new edit"; }],
  ["new box", (c) => { c.boxes.push({ id: 2, desc: "new box", enabled: true }); }],
  ["deleted box", (c) => { c.boxes = []; }],
  ["drag before pointerup serialization", (c) => { c.boxes[0].x = 0.25; }],
  ["disabled state", (c) => { c.boxes[0].enabled = true; }],
  ["summary input", (c) => { c.summary.value = "new summary"; }],
  ["resolution", (c) => { c.widgets.width = 1344; }],
  ["language", (c) => { c.target = "Japanese"; }],
  ["removed/reconfigured node generation", (c) => { c.viewTranslateSeq += 1; }],
]) {
  const { context: c, request } = translationContext();
  const pending = c.translateBoardToViewLanguage();
  edit(c);
  const editedBoxes = plain(c.boxes);
  request.resolve({ caption: { boxes: [{ desc: "old translated caption" }] }, data: { language: "Korean" } });
  assert.equal(await pending, false, `${label}: stale translation must be discarded`);
  assert.equal(c.applied, 0, `${label}: whole-board replacement must not run`);
  assert.deepEqual(plain(c.boxes), editedBoxes, `${label}: edits must survive`);
}
{
  const { context: c, request } = translationContext();
  const pending = c.translateBoardToViewLanguage();
  c.selectedId = null;
  request.resolve({ caption: { boxes: [{ desc: "translated" }] }, data: { language: "Korean" } });
  assert.equal(await pending, true, "selection alone must not cancel translation");
  assert.equal(c.boxes[0].desc, "translated");
  assert.equal(c.boxes[0].enabled, false, "translation must preserve disabled boxes");
}
{
  const { context: c, request } = translationContext();
  const pending = c.translateBoardToViewLanguage();
  c.boxes[0].desc = "new edit";
  request.reject(new Error("obsolete network failure"));
  assert.equal(await pending, false, "obsolete failure must not open a fallback dialog");
}

// Actual Reviewer source: deterministic timers let cancellation happen before the callback.
function reviewerContext() {
  const timers = new Map();
  let nextTimer = 1;
  const queued = [];
  const graph = {
    name: "origin", _nodes: [], links: {}, setDirtyCanvas: noop,
    getNodeById(id) { return this._nodes.find((node) => String(node.id) === String(id)); },
  };
  const context = {
    console, Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map, WeakMap, WeakSet,
    URL, URLSearchParams, AbortController,
    app: { graph, canvas: { graph }, registerExtension: noop,
      async queuePrompt() { queued.push(this.graph.name); return true; } },
    api: { addEventListener: noop, apiURL: (value) => value },
    window: { addEventListener: noop, setTimeout(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
      clearTimeout(id) { timers.delete(id); }, requestAnimationFrame: () => 0, cancelAnimationFrame: noop },
    queueMicrotask: noop, document: { addEventListener: noop, querySelectorAll: () => [], querySelector: () => null },
    LiteGraph: { NODE_WIDGET_HEIGHT: 24 }, Image: class {},
    __DENO_LOCAL_LLM_REVIEWER_TEST_HOOK__: (api) => { context.hook = api; },
  };
  vm.createContext(context);
  vm.runInContext(read("deno_local_llm_refiner.js"), context);
  const seed = { id: 1, type: "KSampler", graph, widgets: [{ name: "seed", value: 10, options: { max: 999 } }], setDirtyCanvas: noop };
  const node = { id: 2, type: "DenoAIReviewGate", graph, properties: {}, inputs: [], widgets: [], setDirtyCanvas: noop };
  graph._nodes = [seed, node];
  context.hook.installLocalLLMNodeCleanup(node);
  context.hook.setReviewerSeedTarget(node, "1:seed");
  context.hook.setReviewerAutoRetryEnabled(node, true);
  return { context, graph, seed, node, queued, timers,
    schedule() { assert.equal(context.hook.maybeAutoRetryReviewer(node, { passed: false }), true); return [...timers.values()].at(-1); } };
}
for (const [label, cancel] of [
  ["disable", (r) => r.context.hook.setReviewerAutoRetryEnabled(r.node, false)],
  ["remove", (r) => { r.graph._nodes = [r.seed]; r.node.onRemoved(); }],
  ["workflow switch", (r) => { r.context.app.graph = { ...r.graph, name: "other", _nodes: [] }; }],
  ["same graph reload", (r) => { r.graph._nodes = [r.seed, { ...r.node }]; }],
  ["reset", (r) => r.context.hook.resetReviewerAutoRetry(r.node)],
]) {
  const r = reviewerContext();
  const callback = r.schedule();
  assert.equal(r.seed.widgets[0].value, 11);
  cancel(r);
  await callback(); // Even a callback already dispatched by the browser must stay canceled.
  assert.deepEqual(r.queued, [], `${label}: canceled retry must not submit any graph`);
  assert.equal(r.seed.widgets[0].value, 10, `${label}: unused seed increment must be restored`);
  assert.equal(r.node._denoReviewerAutoRetryBusy, false);
}
{
  const r = reviewerContext();
  const callback = r.schedule();
  r.seed.widgets[0].value = 777;
  r.context.hook.setReviewerAutoRetryEnabled(r.node, false);
  await callback();
  assert.equal(r.seed.widgets[0].value, 777, "cancel must not overwrite a user's later seed edit");
  assert.equal(r.timers.size, 0, "disable must clear the timer");
}
{
  const r = reviewerContext();
  await r.schedule()();
  assert.deepEqual(r.queued, ["origin"], "valid auto retry must still submit once");
  r.context.hook.resetReviewerAutoRetry(r.node);
  assert.equal(r.seed.widgets[0].value, 11, "submitted seed must not be rolled back");
}
for (const cancel of [
  (r) => r.context.hook.setReviewerAutoRetryEnabled(r.node, false),
  (r) => { r.context.app.graph = { ...r.graph, name: "other", _nodes: [] }; },
]) {
  const r = reviewerContext();
  const preflight = deferred();
  Object.assign(r.context, {
    directorQueuePromptHookInstalled: false, directorQueuePromptHookRetryScheduled: false,
    directorNodes: new Set([{ _idd: { preflightIncomingPromptBeforeQueue: () => preflight.promise } }]),
  });
  vm.runInContext(section(directorSource, "  function installDirectorQueuePromptHook()", "\n  installDirectorQueuePromptHook();"), r.context);
  r.context.installDirectorQueuePromptHook();
  const pending = r.schedule()();
  cancel(r);
  preflight.resolve(false);
  await pending;
  assert.deepEqual(r.queued, [], "cancellation during Director preflight must stop the final queue call");
  assert.equal(r.seed.widgets[0].value, 10, "preflight cancellation must restore the unused seed");
}

function nativeReviewerContext() {
  const r = reviewerContext();
  const auth = deferred();
  const serialization = deferred();
  const response = deferred();
  const submitted = [];
  const app = r.context.app;
  app.rootGraph = r.graph;
  app.queueItems = [];
  app.processingQueue = false;
  app.graphToPrompt = async function (graph) {
    await serialization.promise;
    return { output: {
      "1": { class_type: "KSampler", inputs: {} },
      "2": { class_type: "DenoAIReviewGate", inputs: { image: ["1", 0], review: "FAIL", review_mode: "Review" } },
      "3": { class_type: "SaveImage", inputs: { images: ["2", 0] } },
    }, graphName: graph.name };
  };
  r.context.api.queuePrompt = async (_number, bundle) => {
    submitted.push(bundle.graphName);
    r.lastSubmittedNodes = Object.keys(bundle.output);
    await response.promise;
    return { prompt_id: "accepted" };
  };
  // Native app.ts queue order: push -> auth await -> pop -> graphToPrompt await -> API.
  app.queuePrompt = async function (number, batchCount = 1) {
    this.queueItems.push({ number, batchCount });
    if (this.processingQueue) return false;
    this.processingQueue = true;
    try {
      await auth.promise;
      while (this.queueItems.length) {
        const item = this.queueItems.pop();
        const bundle = await this.graphToPrompt(this.rootGraph);
        await r.context.api.queuePrompt(item.number, bundle);
      }
    } finally { this.processingQueue = false; }
    return true;
  };
  r.context.hook.installLocalLLMApiQueuePromptHook(r.context.api);
  r.context.hook.installLocalLLMAppQueuePromptHook(app);
  r.context.installReviewerGraphToPromptHook();
  return { ...r, auth, serialization, response, submitted,
    get lastSubmittedNodes() { return r.lastSubmittedNodes; },
    switchGraph() { app.graph = app.rootGraph = { ...r.graph, name: "other", _nodes: [] }; } };
}
async function settleMicrotasks() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
for (const stage of ["auth", "serialization"]) {
  const r = nativeReviewerContext();
  const pending = r.schedule()();
  if (stage === "serialization") { r.auth.resolve(); await settleMicrotasks(); }
  r.switchGraph();
  r.auth.resolve(); r.serialization.resolve(); r.response.resolve();
  await pending;
  assert.deepEqual(r.submitted, [], `${stage}: a stale native queue item must stop at the API boundary`);
  assert.equal(r.seed.widgets[0].value, 10);
}
{
  const r = nativeReviewerContext();
  const pending = r.schedule()();
  r.auth.resolve(); r.serialization.resolve();
  await settleMicrotasks();
  assert.deepEqual(r.submitted, ["origin"]);
  assert.deepEqual(r.lastSubmittedNodes, ["1", "2"], "owned retry must keep Regenerate mode on its own prompt");
  r.context.hook.setReviewerAutoRetryEnabled(r.node, false);
  assert.equal(r.seed.widgets[0].value, 11, "disable after dispatch must preserve the already-used seed");
  r.response.resolve();
  await pending;
}
{
  const r = nativeReviewerContext();
  const manual = r.context.app.queuePrompt(0, 1);
  const pending = r.schedule()();
  await settleMicrotasks();
  assert.equal(r.context.app.queueItems.length, 2, "busy native queue must retain its owned retry request");
  assert.equal(r.node._denoReviewerAutoRetryBusy, true, "queued retry must remain owned until dispatch/cancel");
  r.context.hook.setReviewerAutoRetryEnabled(r.node, false);
  r.auth.resolve(); r.serialization.resolve(); r.response.resolve();
  await Promise.all([manual, pending]);
  assert.deepEqual(r.submitted, ["origin"], "cancellation must spare the unrelated manual request");
  assert.equal(r.seed.widgets[0].value, 10);
}
{
  const r = nativeReviewerContext();
  const pending = r.schedule()();
  r.context.hook.setReviewerAutoRetryEnabled(r.node, false);
  r.switchGraph();
  const manual = r.context.app.queuePrompt(0, 1);
  r.auth.resolve(); r.serialization.resolve(); r.response.resolve();
  await Promise.all([manual, pending]);
  assert.deepEqual(r.submitted, ["other"], "a later manual request must not inherit the canceled retry guard");
  assert.deepEqual(r.lastSubmittedNodes, ["1", "2", "3"], "manual prompt must retain its downstream outputs");
}
for (const stage of ["serialization error", "queue cleared"]) {
  const r = nativeReviewerContext();
  r.context.console = { ...console, warn: noop };
  const pending = r.schedule()();
  if (stage === "serialization error") {
    r.auth.resolve();
    r.serialization.reject(new Error("prompt failed before submission"));
  } else {
    r.context.app.queueItems.length = 0;
    r.auth.resolve(); r.serialization.resolve();
  }
  r.response.resolve();
  await pending;
  assert.deepEqual(r.submitted, [], `${stage}: no prompt should submit`);
  assert.equal(r.node._denoReviewerAutoRetryBusy, false, `${stage}: retry ownership must be released`);
  assert.equal(r.seed.widgets[0].value, 10);
}

// Actual Fold implementation and lifecycle hooks; no canvas draw is simulated here.
function foldContext() {
  const graph = { _nodes: [], _groups: [], setDirtyCanvas: noop };
  const context = { console, Date, Math, Map, Set, Array, Object, Number, String, Boolean, window: {},
    app: { graph, canvas: { graph, selectedItems: new Set(), setDirty: noop }, registerExtension(extension) { context.extension = extension; } } };
  vm.createContext(context);
  vm.runInContext(read("deno_visual_fold.js"), context);
  graph._nodes = [1, 2, 3, 4].map((id) => ({ id, graph, pos: [id * 200, 100], size: [180, 200],
    title: `Node ${id}`, properties: {}, flags: {}, widgets: [], color: "#123456" }));
  return { context, graph };
}
{
  const { context: c, graph } = foldContext();
  const survivor = graph._nodes[0];
  const anchor = c.foldNodes(graph._nodes.slice(0, 2));
  const otherAnchor = c.foldNodes(graph._nodes.slice(2));
  anchor.pos = [anchor.pos[0] + 50, anchor.pos[1] + 20];
  graph._nodes = graph._nodes.filter((node) => node !== anchor);
  anchor.onRemoved();
  assert.equal(c.isHiddenFoldMember(survivor), false);
  assert.deepEqual(plain(survivor.pos), [250, 120], "deleting a moved anchor must preserve group displacement");
  assert.deepEqual(plain(survivor.size), [180, 200]);
  assert.equal(survivor.title, "Node 1");
  assert.equal(survivor.flags.collapsed, false);
  assert.equal(survivor.color, "#123456");
  assert.equal(c.foldMeta(survivor), null);
  assert.equal(c.foldMeta(otherAnchor).index, 0, "other folds must stay folded");
}
{
  const { context: c, graph } = foldContext();
  const anchor = c.foldNodes(graph._nodes.slice(0, 2));
  c.refreshFoldedLooks();
  const saved = plain(graph._nodes.filter((node) => node !== anchor).map(({ id, pos, size, title, properties, flags, color }) =>
    ({ id, pos, size, title, properties, flags, color })));
  graph._nodes = saved.map((node) => ({ ...node, graph }));
  c.extension.afterConfigureGraph();
  const survivor = graph._nodes[0];
  assert.equal(c.isHiddenFoldMember(survivor), false, "saved orphan must recover on load");
  assert.deepEqual(plain(survivor.size), [180, 200]);
  assert.equal(survivor.title, "Node 1");
  assert.equal(c.foldMeta(survivor), null);
  assert.equal(typeof survivor.onRemoved, "function", "loaded nodes need removal cleanup");
}
{
  const { context: c, graph } = foldContext();
  const anchor = c.foldNodes(graph._nodes.slice(0, 2));
  c.unfoldGroup(anchor);
  assert.deepEqual(graph._nodes.slice(0, 2).map((node) => node.title), ["Node 1", "Node 2"]);
  assert.equal(graph._nodes.slice(0, 2).every((node) => !c.foldMeta(node)), true);
}
console.log("frontend_review_regressions_harness passed");
