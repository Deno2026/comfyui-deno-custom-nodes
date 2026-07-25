import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const repo = process.argv[2];
if (!repo) throw new Error("repo path argument is required");

const source = fs
  .readFileSync(path.join(repo, "web/js/deno_ideogram_director.js"), "utf8")
  .replaceAll("import.meta.url", "\"file:///deno_ideogram_director.js\"");

let helpers = null;
const app = {
  api: { addEventListener() {} },
  registerExtension() {},
  graph: null,
  rootGraph: null,
};
const classList = { add() {}, remove() {}, toggle() {} };
const document = {
  createElement() {
    return {
      classList,
      style: {},
      dataset: {},
      children: [],
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); return child; },
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
      remove() {},
    };
  },
  getElementById() { return null; },
  head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {} },
  addEventListener() {},
  removeEventListener() {},
};
const windowObj = {
  comfyAPI: { app: { app } },
  __DENO_IDEOGRAM_DIRECTOR_TEST_HOOK__(api) { helpers = api; },
  addEventListener() {},
  removeEventListener() {},
  setTimeout() {},
  clearTimeout() {},
  LiteGraph: { NEVER: 4 },
};
const context = {
  console,
  document,
  URL,
  window: windowObj,
  setTimeout() {},
  clearTimeout() {},
  ResizeObserver: class { observe() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} },
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "deno_ideogram_director.js" });

if (!helpers?.pointerAnchoredPanelPosition) {
  throw new Error("pointerAnchoredPanelPosition test hook was not installed");
}

const place = helpers.pointerAnchoredPanelPosition;
const close = (actual, expected, label) => {
  if (Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
};
const check = (condition, label) => {
  if (!condition) throw new Error(label);
};

{
  const result = place({
    pointerX: 400,
    pointerY: 300,
    modalRect: { left: 100, top: 80, right: 1000, bottom: 780, width: 900, height: 700 },
    modalLayoutWidth: 900,
    modalLayoutHeight: 700,
    panelRect: { width: 400, height: 360 },
    viewportWidth: 1200,
    viewportHeight: 900,
  });
  check(result.side === "right", "normal board should open to the pointer's right");
  close(result.clientLeft, 412, "normal client left");
  close(result.clientTop, 312, "normal client top");
  close(result.left, 312, "normal modal-local left");
  close(result.top, 232, "normal modal-local top");
}

{
  const result = place({
    pointerX: 300,
    pointerY: 200,
    modalRect: { left: 180, top: 120, right: 630, bottom: 470, width: 450, height: 350 },
    modalLayoutWidth: 900,
    modalLayoutHeight: 700,
    panelRect: { width: 200, height: 180 },
    viewportWidth: 1280,
    viewportHeight: 720,
  });
  check(result.side === "right", "zoomed board should still prefer the pointer's right");
  close(result.scaleX, 0.5, "zoomed DOM scale x");
  close(result.scaleY, 0.5, "zoomed DOM scale y");
  close(result.clientLeft, 312, "zoomed client left");
  close(result.clientTop, 212, "zoomed client top");
  close(result.left, 264, "zoomed modal-local left");
  close(result.top, 184, "zoomed modal-local top");
}

{
  const shared = {
    pointerX: 900,
    pointerY: 860,
    modalRect: { left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900 },
    modalLayoutWidth: 1440,
    modalLayoutHeight: 900,
    viewportWidth: 1440,
    viewportHeight: 900,
  };
  const objectPanel = place({ ...shared, panelRect: { width: 400, height: 240 } });
  const textPanel = place({ ...shared, panelRect: { width: 400, height: 520 } });
  close(objectPanel.clientTop, 648, "short Object panel bottom clamp");
  close(textPanel.clientTop, 368, "taller Text panel is reclamped upward");
  check(objectPanel.clientTop + 240 <= 888, "short Object panel stays above visible bottom padding");
  check(textPanel.clientTop + 520 <= 888, "taller Text panel stays above visible bottom padding");
  check(textPanel.clientTop < objectPanel.clientTop, "growing panel must move upward at the same pointer");
}

{
  const result = place({
    pointerX: 1400,
    pointerY: 870,
    modalRect: { left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900 },
    modalLayoutWidth: 1440,
    modalLayoutHeight: 900,
    panelRect: { width: 400, height: 360 },
    viewportWidth: 1440,
    viewportHeight: 900,
  });
  check(result.side === "left", "fullscreen right edge should flip the panel to the left");
  close(result.clientLeft, 988, "fullscreen flipped client left");
  close(result.clientTop, 528, "fullscreen bottom clamp");
  check(result.clientLeft >= 12, "fullscreen panel stays inside viewport left edge");
  check(result.clientLeft + 400 <= 1428, "fullscreen panel stays inside viewport right edge");
  check(result.clientTop + 360 <= 888, "fullscreen panel stays inside viewport bottom edge");
}

{
  const result = place({
    pointerX: 680,
    pointerY: 580,
    modalRect: { left: -200, top: 50, right: 700, bottom: 750, width: 900, height: 700 },
    modalLayoutWidth: 900,
    modalLayoutHeight: 700,
    panelRect: { width: 400, height: 360 },
    viewportWidth: 800,
    viewportHeight: 600,
  });
  check(result.side === "left", "partially clipped modal should flip at its visible right edge");
  check(result.clientLeft >= 12, "partially clipped modal clamps into viewport intersection");
  check(result.clientLeft + 400 <= 688, "panel stays inside the modal/viewport visible right edge");
  check(result.clientTop >= 62, "panel stays inside the modal/viewport visible top edge");
  check(result.clientTop + 360 <= 588, "panel stays inside the modal/viewport visible bottom edge");
}

console.log("ideogram director pointer panel harness passed");
