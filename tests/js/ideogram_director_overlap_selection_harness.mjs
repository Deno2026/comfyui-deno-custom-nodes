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

if (!helpers?.overlappingBoxIdsAtPoint || !helpers?.nextOverlappingBoxId) {
  throw new Error("Ideogram Director overlap-selection test hooks were not installed");
}

const hits = helpers.overlappingBoxIdsAtPoint;
const next = helpers.nextOverlappingBoxId;
const same = (actual, expected, label) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
};
const check = (condition, label) => {
  if (!condition) throw new Error(label);
};

const boxes = [
  { id: "back", x: 0.1, y: 0.1, w: 0.6, h: 0.6, enabled: true },
  { id: "middle-disabled", x: 0.2, y: 0.2, w: 0.5, h: 0.5, enabled: false },
  { id: "front", x: 0.3, y: 0.3, w: 0.4, h: 0.4, enabled: true },
];
const originalOrder = boxes.map((box) => box.id);

same(
  hits(boxes, { x: 0.4, y: 0.4 }),
  ["front", "middle-disabled", "back"],
  "last box is front and disabled middle remains selectable",
);
same(boxes.map((box) => box.id), originalOrder, "hit test preserves original box order");
same(hits(boxes, { x: 0.15, y: 0.15 }), ["back"], "single candidate");
same(hits(boxes, { x: 0.05, y: 0.05 }), [], "point outside every box");
same(
  hits(boxes, { x: 0.7, y: 0.7 }),
  ["front", "middle-disabled", "back"],
  "shared bottom-right boundary is inclusive",
);
same(hits(boxes, { x: -0.01, y: 0.4 }), [], "point outside normalized range");
same(hits(boxes, { x: 0.4, y: 1.01 }), [], "point below normalized range");
same(hits(boxes, { x: Number.NaN, y: 0.4 }), [], "NaN point is invalid");
same(hits(boxes, { x: "0.4", y: 0.4 }), [], "non-numeric normalized point is invalid");
same(hits(boxes, null), [], "missing point is invalid");
same(
  hits([
    null,
    { id: null, x: 0, y: 0, w: 1, h: 1 },
    { id: "nan", x: Number.NaN, y: 0, w: 1, h: 1 },
    { id: "zero", x: 0, y: 0, w: 0, h: 1 },
    { id: "negative", x: 0, y: 0, w: -1, h: 1 },
    { id: 0, x: 0, y: 0, w: 1, h: 1 },
  ], { x: 0.5, y: 0.5 }),
  [0],
  "invalid boxes are ignored while id zero remains valid",
);

const candidates = ["front", "middle-disabled", "back"];
same(next(candidates, null), "front", "null selection starts at front");
same(next(candidates, "missing"), "front", "selection outside candidates starts at front");
same(next(candidates, "front"), "middle-disabled", "front advances to disabled middle");
same(next(candidates, "middle-disabled"), "back", "middle advances to back");
same(next(candidates, "back"), "front", "back wraps to front");
same(next(["only"], "only"), "only", "single candidate wraps to itself");
same(next([], "front"), null, "empty candidates return null");
same(candidates, ["front", "middle-disabled", "back"], "cycle helper preserves candidate order");
check(boxes[1].enabled === false, "hit test does not mutate disabled state");

console.log("ideogram director overlap selection harness passed");
