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

const tallTop = hooks.calculateCropWindow(1080, 1920, 1920, 1080, 0.5, 0);
const tallBottom = hooks.calculateCropWindow(1080, 1920, 1920, 1080, 0.5, 1);
assert.equal(tallTop.axis, "y");
assert.equal(tallTop.y, 0);
assert.equal(tallBottom.y, 1312.5);
assert.equal(hooks.calculateCropWindow(1920, 1080, 1280, 720, 0.2, 0.8).axis, null);

const fixedViewport = { x: 20, y: 30, width: 160, height: 90 };
const topCropWindow = hooks.calculateCropWindow(1000, 1000, 1600, 900, 0.5, 0);
const bottomCropWindow = hooks.calculateCropWindow(1000, 1000, 1600, 900, 0.5, 1);
const topRenderRect = hooks.calculateCropRenderRect(1000, 1000, fixedViewport, topCropWindow);
const bottomRenderRect = hooks.calculateCropRenderRect(1000, 1000, fixedViewport, bottomCropWindow);
assert.deepEqual(
  [topRenderRect.x, topRenderRect.y, topRenderRect.width, topRenderRect.height],
  [20, 30, 160, 160],
  "the lower panel is the fixed output viewport and shows only pixels inside the crop",
);
assert.deepEqual(
  [bottomRenderRect.x, bottomRenderRect.y, bottomRenderRect.width, bottomRenderRect.height],
  [20, -40, 160, 160],
  "moving the crop pans the source image behind the fixed output viewport",
);

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
for (const name of ["crop_x", "crop_y"]) {
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
};
assert.equal(interactionNode.onMouseDown({ button: 1 }, [20, 20]), "delegated");
assert.deepEqual(interactionNode.delegatedButtons, [1], "middle-button pan event is forwarded over crop controls");
assert.equal(interactionNode.onMouseDown({ button: 0 }, [20, 20]), true);
assert.deepEqual(interactionNode.delegatedButtons, [1], "primary crop gesture is owned by Resize Box");

const cropInteractionNode = {
  widgets: [
    { name: "crop_x", value: 0.5 },
    { name: "crop_y", value: 0.5 },
  ],
  __denoCropPreview: {
    interactive: true,
    sourceRect: { x: 10, y: 20, width: 100, height: 80 },
  },
};
assert.equal(hooks.getCropPreviewHit(cropInteractionNode, 60, 50), true);
assert.equal(hooks.getCropPreviewHit(cropInteractionNode, 120, 50), false);
cropInteractionNode.__denoCropDrag = {
  active: true,
  preview: {
    interactive: true,
    axis: "x",
    sourceRect: { x: 10, y: 20, width: 100, height: 80 },
    cropRect: { x: 35, y: 20, width: 50, height: 80 },
    pointMode: false,
  },
  pointerOffsetX: 25,
  pointerOffsetY: 40,
};
hooks.updateCropDrag(cropInteractionNode, 85, 60);
assert.equal(cropInteractionNode.widgets[0].value, 1, "horizontal crop drag reaches the right edge");
assert.equal(cropInteractionNode.widgets[1].value, 0.5, "inactive crop axis is preserved");

cropInteractionNode.__denoCropDrag = {
  active: true,
  preview: {
    interactive: true,
    axis: "y",
    sourceRect: { x: 20, y: 30, width: 160, height: 90 },
    viewportRect: { x: 20, y: 30, width: 160, height: 90 },
    renderedSourceRect: { x: 20, y: -5, width: 160, height: 160 },
    cropRect: { x: 20, y: 30, width: 160, height: 90 },
    pointMode: false,
    directPan: true,
  },
  startMouseX: 100,
  startMouseY: 75,
  startCropX: 0.5,
  startCropY: 0.5,
};
hooks.updateCropDrag(cropInteractionNode, 100, 40);
assert.equal(cropInteractionNode.widgets[0].value, 1, "fixed viewport pan preserves the inactive axis");
assert.equal(cropInteractionNode.widgets[1].value, 1, "dragging the image upward reveals the bottom crop");

console.log("resize_box_display_harness passed");
