import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "web/js/deno_res_helper.js");

let hooks = null;
let registeredExtension = null;
const graph = {
  links: {},
  nodes: new Map(),
  getNodeById(id) {
    return this.nodes.get(id) || null;
  },
};

const context = {
  console,
  URLSearchParams,
  queueMicrotask(callback) {
    callback();
  },
  app: {
    graph,
    registerExtension(extension) {
      registeredExtension = extension;
    },
  },
  __DENO_RES_HELPER_TEST_HOOK__(registered) {
    hooks = registered;
  },
};
context.addEventListener = () => {};
context.removeEventListener = () => {};
context.window = context;
context.globalThis = context;

let source = fs.readFileSync(scriptPath, "utf8");
source = source.replace(/^import .*;\r?\n/gm, "");
vm.runInNewContext(source, context, { filename: scriptPath });

assert.ok(hooks, "Resize Box frontend did not expose test hooks");
assert.ok(registeredExtension, "Resize Box frontend did not register its extension");

function makeNode({ connected = false, linkId = 99, width = 1001, height = 777 } = {}) {
  const values = {
    mode: "Keep Input Ratio",
    width,
    height,
    ratio_preset: "16:9",
    megapixels: 1,
    divisible_by: 32,
    resize_method: "Center Crop (Fill)",
    interpolation: "lanczos",
    crop_x: 0.5,
    crop_y: 0.5,
    crop_zoom: 1,
  };
  return {
    inputs: [{ name: "image", link: connected ? linkId : null }],
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

const loadImageSource = {
  id: 8,
  widgets: [{ name: "image", value: "references/session/example image.png" }],
};
graph.nodes.set(8, loadImageSource);
graph.links[101] = { origin_id: 8 };
const loadImageState = hooks.getLinkedImageState(makeNode({ connected: true, linkId: 101 }));
assert.equal(
  loadImageState.previewUrl,
  "/view?filename=example+image.png&subfolder=references%2Fsession&type=input",
  "Load Image widgets use the same input /view URL pattern as Ideogram Director backdrops",
);
assert.equal(
  hooks.sourcePreviewUrl({ widgets: [{ name: "image", value: "windows\\folder\\still.webp" }] }),
  "/view?filename=still.webp&subfolder=windows%2Ffolder&type=input",
  "Windows path separators are normalized before building the preview URL",
);

const rerouteSource = { id: 9, type: "Reroute", inputs: [{ name: "", link: 102 }] };
graph.nodes.set(9, rerouteSource);
graph.links[102] = { origin_id: 8 };
graph.links[103] = { origin_id: 9 };
const reroutedLoadImageState = hooks.getLinkedImageState(makeNode({ connected: true, linkId: 103 }));
assert.equal(
  reroutedLoadImageState.previewUrl,
  loadImageState.previewUrl,
  "Resize Box traces Reroute links back to the real Load Image source",
);

const nestedSource = {
  id: "nested-source",
  imgs: [{ naturalWidth: 640, naturalHeight: 360 }],
};
const nestedGraph = {
  links: { 201: { origin_id: "nested-source" } },
  _nodes: [nestedSource],
  getNodeById(id) {
    return this._nodes.find((candidate) => String(candidate.id) === String(id)) || null;
  },
};
const nestedNode = makeNode({ connected: true, linkId: 201 });
nestedNode.graph = nestedGraph;
const nestedState = hooks.getLinkedImageState(nestedNode);
assert.deepEqual(
  [nestedState.size.width, nestedState.size.height],
  [640, 360],
  "Resize Box resolves the graph owned by a subgraph node before the root graph",
);

const stringSourceId = "string-source-id";
graph.nodes.set(stringSourceId, { id: stringSourceId, imgs: [{ naturalWidth: 1080, naturalHeight: 1920 }] });
graph.links[100] = { origin_id: stringSourceId };
const knownStringId = makeNode({ connected: true, linkId: 100 });
const knownStringIdBefore = JSON.stringify(knownStringId.widgets);
const expectedKnownStringId = hooks.computeKeepInputRatioDims(1080, 1920, 1, 32);
const knownStringIdInfo = hooks.calculateDisplayInfo(knownStringId);
assert.deepEqual(
  [knownStringIdInfo.width, knownStringIdInfo.height],
  Array.from(expectedKnownStringId),
  "ComfyUI string node IDs must resolve the linked image size",
);
assert.deepEqual(
  [knownStringIdInfo.previewWidth, knownStringIdInfo.previewHeight],
  Array.from(expectedKnownStringId),
);
assert.doesNotMatch(knownStringIdInfo.text, /Input-dependent/);
assert.equal(JSON.stringify(knownStringId.widgets), knownStringIdBefore);

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

const wideLeft = hooks.calculateCropWindow(1920, 1080, 1080, 1080, 0, 0.5);
const wideCenter = hooks.calculateCropWindow(1920, 1080, 1080, 1080, 0.5, 0.5);
const wideRight = hooks.calculateCropWindow(1920, 1080, 1080, 1080, 1, 0.5);
assert.equal(wideLeft.axis, "x");
assert.deepEqual([wideLeft.x, wideLeft.width], [0, 1080]);
assert.deepEqual([wideCenter.x, wideCenter.width], [420, 1080]);
assert.deepEqual([wideRight.x, wideRight.width], [840, 1080]);
assert.equal(wideCenter.zoom, 1, "legacy workflows without crop_zoom retain the original crop");

const tallTop = hooks.calculateCropWindow(1080, 1920, 1920, 1080, 0.5, 0);
const tallBottom = hooks.calculateCropWindow(1080, 1920, 1920, 1080, 0.5, 1);
assert.equal(tallTop.axis, "y");
assert.equal(tallTop.y, 0);
assert.equal(tallBottom.y, 1312.5);
assert.equal(hooks.calculateCropWindow(1920, 1080, 1280, 720, 0.2, 0.8).axis, null);

const zoomedCenter = hooks.calculateCropWindow(1920, 1080, 1080, 1080, 0.5, 0.5, 2);
assert.deepEqual(
  [zoomedCenter.x, zoomedCenter.y, zoomedCenter.width, zoomedCenter.height, zoomedCenter.axis, zoomedCenter.zoom],
  [690, 270, 540, 540, "both", 2],
  "zoom shrinks the fixed-aspect crop inside the full source and enables two-axis positioning",
);
const zoomedTopLeft = hooks.calculateCropWindow(1920, 1080, 1080, 1080, 0, 0, 2);
const zoomedBottomRight = hooks.calculateCropWindow(1920, 1080, 1080, 1080, 1, 1, 2);
assert.deepEqual(
  [zoomedTopLeft.x, zoomedTopLeft.y, zoomedBottomRight.x, zoomedBottomRight.y],
  [0, 0, 1380, 540],
  "zoomed crop position spans both source axes",
);
assert.equal(hooks.calculateCropWindow(200, 100, 100, 100, 0.5, 0.5, 0).zoom, 1);
assert.equal(hooks.calculateCropWindow(200, 100, 100, 100, 0.5, 0.5, 999).zoom, 32);

assert.equal(hooks.isPrimaryPointerStart({ button: 0 }), true);
assert.equal(hooks.isPrimaryPointerStart({ button: 1 }), false, "middle-button canvas pan must pass through");
assert.equal(hooks.isPrimaryPointerStart({ button: 2 }), false);
assert.equal(hooks.isPrimaryPointerStart({ button: 0, buttons: 4 }), false, "middle-button bitmask wins over normalized button values");
assert.equal(hooks.isPrimaryPointerStart({ button: 0, buttons: 1 }), true);

class InteractionNode {
  constructor() {
    this.type = "DenoResolutionSetup";
    this.size = [320, 460];
    this.pos = [0, 0];
    this.inputs = [{ name: "image", link: null }];
    this.widgets = [
      { name: "mode", value: "Preset Ratio", type: "combo" },
      { name: "ratio_preset", value: "16:9", type: "combo" },
      { name: "megapixels", value: 1, type: "number" },
      { name: "width", value: 1024, type: "number" },
      { name: "height", value: 1024, type: "number" },
      { name: "divisible_by", value: 32, type: "combo" },
      { name: "resize_method", value: "Crop Position (Fill)", type: "combo" },
      { name: "interpolation", value: "lanczos", type: "combo" },
      { name: "crop_x", value: 0.5, type: "number" },
      { name: "crop_y", value: 0.5, type: "number" },
      { name: "crop_zoom", value: 1, type: "number" },
    ];
    this.delegatedButtons = [];
  }
}
InteractionNode.prototype.computeSize = () => [320, 302];
InteractionNode.prototype.onNodeCreated = () => {};
InteractionNode.prototype.onMouseDown = function (event) {
  this.delegatedButtons.push(event.button);
  return "delegated";
};
await registeredExtension.beforeRegisterNodeDef(InteractionNode, { name: "DenoResolutionSetup" });
const interactionNode = new InteractionNode();
interactionNode.onNodeCreated();
for (const name of ["crop_x", "crop_y", "crop_zoom"]) {
  const hiddenWidget = interactionNode.widgets.find((widget) => widget.name === name);
  assert.equal(hiddenWidget.hidden, true, `${name} backend widget stays visually hidden`);
  assert.equal(hiddenWidget.type, "hidden");
  assert.equal(typeof hiddenWidget.draw, "function");
}
assert.equal(interactionNode.widgets.find((widget) => widget.name === "ratio_preset").type, "combo");
assert.equal(interactionNode.widgets.find((widget) => widget.name === "megapixels").type, "number");
assert.equal(interactionNode.widgets.find((widget) => widget.name === "width").type, "converted-widget");
assert.equal(interactionNode.widgets.find((widget) => widget.name === "height").type, "converted-widget");
const interactionModeWidget = interactionNode.widgets.find((widget) => widget.name === "mode");
interactionModeWidget.value = "Manual Input";
interactionModeWidget.callback();
assert.equal(interactionNode.widgets.find((widget) => widget.name === "ratio_preset").type, "converted-widget");
assert.equal(interactionNode.widgets.find((widget) => widget.name === "megapixels").type, "converted-widget");
assert.equal(interactionNode.widgets.find((widget) => widget.name === "width").type, "number");
assert.equal(interactionNode.widgets.find((widget) => widget.name === "height").type, "number");
interactionModeWidget.value = "Keep Input Ratio";
interactionModeWidget.callback();
assert.equal(interactionNode.widgets.find((widget) => widget.name === "ratio_preset").type, "converted-widget");
assert.equal(interactionNode.widgets.find((widget) => widget.name === "megapixels").type, "number");
assert.equal(interactionNode.widgets.find((widget) => widget.name === "width").type, "converted-widget");
assert.equal(interactionNode.widgets.find((widget) => widget.name === "height").type, "converted-widget");
interactionNode.__denoPreviewAnchors = [{ name: "nw", x: 20, y: 20, size: 5 }];
interactionNode.__denoCropPreview = {
  interactive: true,
  sourceRect: { x: 10, y: 10, width: 100, height: 80 },
  cropRect: { x: 20, y: 20, width: 50, height: 50 },
  sourceSize: { width: 100, height: 80 },
  targetSize: { width: 1, height: 1 },
};
assert.equal(interactionNode.onMouseDown({ button: 1 }, [20, 20]), "delegated");
assert.deepEqual(interactionNode.delegatedButtons, [1], "middle-button pan event is forwarded over crop controls");
assert.equal(interactionNode.onMouseDown({ button: 0 }, [20, 20]), true);
assert.deepEqual(interactionNode.delegatedButtons, [1], "primary crop gesture is owned by Resize Box");
assert.equal(interactionNode.onMouseUp({ button: 0 }, [20, 20]), true);

const cropInteractionNode = {
  widgets: [
    { name: "crop_x", value: 0.5 },
    { name: "crop_y", value: 0.5 },
    { name: "crop_zoom", value: 2 },
    { name: "megapixels", value: 1.5 },
    { name: "width", value: 1632 },
    { name: "height", value: 928 },
  ],
  __denoCropPreview: {
    interactive: true,
    sourceRect: { x: 0, y: 0, width: 200, height: 100 },
    cropRect: { x: 75, y: 25, width: 50, height: 50 },
  },
};
assert.equal(hooks.getCropPreviewHit(cropInteractionNode, 100, 50), true);
assert.equal(hooks.getCropPreviewHit(cropInteractionNode, 20, 50), false);
const fixedOutputBeforePan = cropInteractionNode.widgets
  .filter((widget) => ["megapixels", "width", "height"].includes(widget.name))
  .map((widget) => [widget.name, widget.value]);
cropInteractionNode.__denoCropDrag = {
  active: true,
  preview: {
    interactive: true,
    axis: "both",
    sourceRect: { x: 0, y: 0, width: 200, height: 100 },
    cropRect: { x: 75, y: 25, width: 50, height: 50 },
    cropWindow: { x: 75, y: 25, width: 50, height: 50 },
    sourceSize: { width: 200, height: 100 },
    targetSize: { width: 100, height: 100 },
    pointMode: false,
  },
  startMouseX: 100,
  startMouseY: 50,
  startCropRect: { x: 75, y: 25, width: 50, height: 50 },
};
hooks.updateCropDrag(cropInteractionNode, 175, 75);
assert.equal(cropInteractionNode.widgets.find((widget) => widget.name === "crop_x").value, 1);
assert.equal(cropInteractionNode.widgets.find((widget) => widget.name === "crop_y").value, 1);
assert.equal(cropInteractionNode.widgets.find((widget) => widget.name === "crop_zoom").value, 2);
assert.deepEqual(
  cropInteractionNode.widgets
    .filter((widget) => ["megapixels", "width", "height"].includes(widget.name))
    .map((widget) => [widget.name, widget.value]),
  fixedOutputBeforePan,
  "moving a zoomed crop never changes megapixels or output dimensions",
);

const initialCropRect = { x: 75, y: 25, width: 50, height: 50 };
const initialCropWindow = hooks.calculateCropWindow(200, 100, 100, 100, 0.5, 0.5, 2);
const cornerCases = {
  nw: { opposite: { x: 125, y: 75 }, pointer: { x: 100, y: 50 }, expected: { x: 100, y: 50 } },
  ne: { opposite: { x: 75, y: 75 }, pointer: { x: 100, y: 50 }, expected: { x: 75, y: 50 } },
  sw: { opposite: { x: 125, y: 25 }, pointer: { x: 100, y: 50 }, expected: { x: 100, y: 25 } },
  se: { opposite: { x: 75, y: 25 }, pointer: { x: 100, y: 50 }, expected: { x: 75, y: 25 } },
};

for (const [anchor, testCase] of Object.entries(cornerCases)) {
  const anchorNode = {
    widgets: [
      { name: "crop_x", value: 0.5 },
      { name: "crop_y", value: 0.5 },
      { name: "crop_zoom", value: 2 },
      { name: "megapixels", value: 1.5 },
      { name: "width", value: 1632 },
      { name: "height", value: 928 },
    ],
  };
  const fixedOutputBeforeResize = anchorNode.widgets
    .filter((widget) => ["megapixels", "width", "height"].includes(widget.name))
    .map((widget) => [widget.name, widget.value]);
  const preview = {
    interactive: true,
    sourceRect: { x: 0, y: 0, width: 200, height: 100 },
    cropRect: { ...initialCropRect },
    cropWindow: { ...initialCropWindow },
    sourceSize: { width: 200, height: 100 },
    targetSize: { width: 100, height: 100 },
  };
  anchorNode.__denoAnchorDrag = {
    active: true,
    anchor,
    preview,
    opposite: testCase.opposite,
    aspect: 1,
  };

  hooks.updateAnchorDrag(anchorNode, testCase.pointer.x, testCase.pointer.y);

  const cropZoom = anchorNode.widgets.find((widget) => widget.name === "crop_zoom").value;
  const cropX = anchorNode.widgets.find((widget) => widget.name === "crop_x").value;
  const cropY = anchorNode.widgets.find((widget) => widget.name === "crop_y").value;
  const resizedWindow = hooks.calculateCropWindow(200, 100, 100, 100, cropX, cropY, cropZoom);
  assert.equal(cropZoom, 4, `${anchor} corner updates crop zoom from 2x to 4x`);
  assert.ok(Math.abs(resizedWindow.width / resizedWindow.height - 1) < 1e-9, `${anchor} keeps target AR`);
  assert.ok(Math.abs(resizedWindow.x - testCase.expected.x) < 0.1, `${anchor} keeps the opposite X anchor fixed`);
  assert.ok(Math.abs(resizedWindow.y - testCase.expected.y) < 0.1, `${anchor} keeps the opposite Y anchor fixed`);
  assert.deepEqual(
    anchorNode.widgets
      .filter((widget) => ["megapixels", "width", "height"].includes(widget.name))
      .map((widget) => [widget.name, widget.value]),
    fixedOutputBeforeResize,
    `${anchor} crop resize preserves fixed output settings`,
  );
}

console.log("resize_box_display_harness passed");
